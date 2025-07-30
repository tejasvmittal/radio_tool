from flask import Flask, send_file
from flask_cors import CORS
from pyngrok import ngrok
import os


app = Flask(__name__)
CORS(app)
public_url = ngrok.connect(5000)
print(" * ngrok tunnel:", public_url)


@app.route('/')
def index():
    return 'Flask server is running.'

@app.route("/data.csv")
def get_csv():
    csv_path = os.path.join(os.path.dirname(__file__), "data.csv")
    return send_file(csv_path, mimetype="text/csv")


@app.route('/audio_snippets/<filename>')
def get_audio(filename):
    return send_file(f'audio_snippets/{filename}', mimetype='audio/mp3')

if __name__ == '__main__':
    app.run()