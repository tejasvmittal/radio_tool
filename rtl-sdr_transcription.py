import queue
import time
import threading
import numpy as np
import pyaudio
import webrtcvad
import collections
import whisper
import torch
import concurrent.futures
import wave
from sentence_transformers import SentenceTransformer, util
import ast
from collections import defaultdict
import csv
from pydub import AudioSegment 
import ffmpeg

# Constants
SAMPLE_RATE = 16000
FRAME_DURATION_MS = 30  # ms
FRAME_SIZE = int(SAMPLE_RATE * FRAME_DURATION_MS / 1000)
SILENCE_TIMEOUT = 10  # seconds
MAX_CHUNK_DURATION = 20
car_number = input("Enter car number: ")


# Global shared state
audio_queue = queue.Queue()
stop_event = threading.Event()
last_voice_time = time.time()
context_prompt = "This is a radio chatter between race engineer and race car driver."

model = whisper.load_model("small") # whisper model
transformer_model = SentenceTransformer('all-MiniLM-L6-v2')  # sentence transformer model

with open("topics2.txt", 'r') as f:
    content = f.read()
    topics = ast.literal_eval(content)

topic_embeddings = {}
# topic_embeddings = {topic: transformer_model.encode(desc) for desc, topic in topics}
topic_to_sentences = defaultdict(list)
for sentence, label in topics:
    topic_to_sentences[label].append(sentence)

for topic, sentences in topic_to_sentences.items():
    embeddings = transformer_model.encode(sentences, convert_to_numpy=True)
    topic_embeddings[topic] = np.mean(embeddings, axis=0)


def classify_with_scores(text):
    text_embedding = transformer_model.encode(text)
    scores = {}
    for topic, embedding in topic_embeddings.items():
        score = util.cos_sim(text_embedding, embedding).item()
        scores[topic] = round(score, 4) 
    return scores

def audio_callback(in_data, frame_count, time_info, status):
    audio_queue.put(in_data)
    return (None, pyaudio.paContinue)

def frame_generator():
    while not stop_event.is_set():
        try:
            data = audio_queue.get(timeout=1)
            if data is None:
                break
            yield Frame(data, time.time())
        except queue.Empty:
            continue

class Frame:
    def __init__(self, bytes, timestamp):
        self.bytes = bytes
        self.timestamp = timestamp


def save_audio_to_file(audio_data, filename):
    # Normalize audio to int16 before saving to WAV
    audio_data_int16 = np.int16(audio_data * 32768.0)  # Convert from float32 to int16
    with wave.open(filename, 'wb') as wf:
        wf.setnchannels(1)  # Mono audio
        wf.setsampwidth(2)  # 16-bit audio
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(audio_data_int16.tobytes())


# Modify the vad_collector to save the processed audio
def vad_collector(sample_rate, frame_duration_ms, padding_duration_ms, vad, frames, silence_timeout=10, num_channels=2):
    num_padding_frames = int(padding_duration_ms / frame_duration_ms)
    ring_buffer = collections.deque(maxlen=num_padding_frames)

    triggered = False
    voiced_float_audio = []
    global last_voice_time
    audio_chunk_count = 0  # To keep track of the segments we save

    chunk_start_time = None

    for frame in frames:
        # Convert raw audio to NumPy array (multi-channel int16)
        pcm_audio = np.frombuffer(frame.bytes, dtype=np.int16)

        if num_channels > 1:
            try:
                pcm_audio = pcm_audio.reshape(-1, num_channels)
                mono_audio = pcm_audio.mean(axis=1).astype(np.int16)
            except ValueError:
                continue  # skip malformed frame
        else:
            mono_audio = pcm_audio

        mono_frame_bytes = mono_audio.tobytes()
        is_speech = vad.is_speech(mono_frame_bytes, sample_rate)
        current_time = time.time()

        if is_speech:
            last_voice_time = current_time

        if not triggered:
            ring_buffer.append((mono_audio, is_speech))
            num_voiced = len([f for f, speech in ring_buffer if speech])
            if num_voiced > 0.9 * ring_buffer.maxlen:
                triggered = True
                chunk_start_time = current_time
                for f, _ in ring_buffer:
                    float_audio = f.astype(np.float32) / 32768.0
                    voiced_float_audio.append(float_audio)
                ring_buffer.clear()
        else:
            float_audio = mono_audio.astype(np.float32) / 32768.0
            voiced_float_audio.append(float_audio)
            ring_buffer.append((mono_audio, is_speech))
            num_unvoiced = len([f for f, speech in ring_buffer if not speech])

            # End of speech detected
            if num_unvoiced > 0.9 * ring_buffer.maxlen:
                triggered = False
                audio_chunk_count += 1
                yield (np.concatenate(voiced_float_audio), chunk_start_time)
                voiced_float_audio = []
                chunk_start_time = None

            # Voice chunk exceeds max duration
            elif chunk_start_time and (current_time - chunk_start_time > MAX_CHUNK_DURATION):
                print("[INFO] Timeout flush: voice too long")
                triggered = False
                audio_chunk_count += 1
                yield (np.concatenate(voiced_float_audio), chunk_start_time)
                voiced_float_audio = []
                chunk_start_time = None

        # Flush if silence timeout hit even while triggered
        if triggered and (current_time - last_voice_time > silence_timeout):
            print("[INFO] Timeout flush: long silence")
            triggered = False
            if voiced_float_audio:
                audio_chunk_count += 1
                yield (np.concatenate(voiced_float_audio), chunk_start_time)
                voiced_float_audio = []
            chunk_start_time = None

    # Final flush after frames are exhausted
    if voiced_float_audio:
        audio_chunk_count += 1
        yield (np.concatenate(voiced_float_audio), chunk_start_time)



def decode_with_timeout(model, mel, timeout=20):
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(
            model.decode,
            mel,
            whisper.DecodingOptions(language="en", fp16=torch.cuda.is_available() 
                                    # ,prompt=context_prompt
                                    )
        )
        try:
            return future.result(timeout=timeout)
        except concurrent.futures.TimeoutError:
            print("[WARNING] Whisper decode timeout.")
            return None


def transcription_worker():
    vad = webrtcvad.Vad(2)
    frames = frame_generator()
    segments = vad_collector(SAMPLE_RATE, FRAME_DURATION_MS, 300, vad, frames, silence_timeout=SILENCE_TIMEOUT, num_channels=8)

    for segment, timestamp in segments:
        if len(segment) == 0:
            continue

        # Save segment as MP3
        timestamp_str = time.strftime('%H%M%S', time.localtime(timestamp))
        mp3_filename = f"audio_snippets/{car_number}_{timestamp_str}.mp3"
        audio_segment = AudioSegment(
            (segment * 32767).astype(np.int16).tobytes(),
            frame_rate=SAMPLE_RATE,
            sample_width=2,
            channels=1
        )
        audio_segment.export("ui/"+mp3_filename, format="mp3")

        audio = whisper.pad_or_trim(segment)
        mel = whisper.log_mel_spectrogram(audio).to(model.device)

        result = decode_with_timeout(model, mel)
        if result is None:
            continue
        
        scores = classify_with_scores(result.text)
        human_time = time.strftime('%H:%M:%S', time.localtime(timestamp))
        global context_prompt
        print_entry = f"[{human_time}] {result.text}\nScores: {scores}\nCar: {car_number}"
        csv_row = [human_time, car_number, result.text]
        print(print_entry)
        top2 = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:2] # adjust to display top x categories based on score
        top2 = ', '.join([t[0] for t in top2])
        print(top2)
        csv_row.append(top2)
        csv_row.append(mp3_filename)
        with open('ui/data.csv', mode='a', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(csv_row)


        # context_prompt += " " + result.text


def silence_monitor():
    global last_voice_time
    while not stop_event.is_set():
        if time.time() - last_voice_time > 30:
            print("[INFO] No speech detected for 30 seconds.")
        time.sleep(10)


def main():
    audio = pyaudio.PyAudio()
    device_index = int(input("Enter the device index: "))
    num_channels = 8
    stream = audio.open(
        format=pyaudio.paInt16,
        channels=num_channels,
        rate=SAMPLE_RATE,
        input=True,
        input_device_index=device_index,
        frames_per_buffer=FRAME_SIZE,
        stream_callback=audio_callback
    )
    stream.start_stream()

    print("[INFO] Listening...")

    transcriber = threading.Thread(target=transcription_worker)
    monitor = threading.Thread(target=silence_monitor)

    transcriber.start()
    monitor.start()

    try:
        while True:
            time.sleep(0.1)
    except KeyboardInterrupt:
        print("[INFO] Stopping...")
        stop_event.set()
        stream.stop_stream()
        stream.close()
        audio.terminate()
        transcriber.join()
        monitor.join()
        timestamp = time.strftime('%m-%d_%H-%M')
        # filename = f"output/transcription_{timestamp}.txt"
        # with open(filename, 'w+', encoding='utf-8') as f:
        #     f.writelines(transcription_log)

if __name__ == "__main__":
    main()

