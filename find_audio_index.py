import pyaudio

def list_audio_devices():
    p = pyaudio.PyAudio()

    common_sample_rates = [8000, 16000, 22050, 32000, 44100, 48000, 96000]
    device_count = p.get_device_count()

    print(f"\n{'Index':<5} {'Name':<40} {'InCh':<5} {'OutCh':<6} {'Supported Rates':<30}")
    print("-" * 100)

    for i in range(device_count):
        device = p.get_device_info_by_index(i)
        input_channels = device.get('maxInputChannels')
        output_channels = device.get('maxOutputChannels')
        supported_rates = []

        if input_channels > 0 or output_channels > 0:
            for rate in common_sample_rates:
                try:
                    if input_channels > 0:
                        p.is_format_supported(rate,
                                              input_device=device['index'],
                                              input_channels=1,
                                              input_format=pyaudio.paInt16)
                        supported_rates.append(rate)
                except:
                    continue

            print(f"{i:<5} {device['name'][:38]:<40} {input_channels:<5} {output_channels:<6} {supported_rates}")

    p.terminate()

if __name__ == "__main__":
    list_audio_devices()

"""
FOUND CABLES: 
CABLE D: 19
CABLE C: 23
"""