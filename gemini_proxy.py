import os
import json
from flask import Flask, request, jsonify

from google import genai

app = Flask(__name__)

def get_client(api_key: str):
    return genai.Client(api_key=api_key)

@app.route('/api/models/list', methods=['POST'])
def list_models():
    try:
        data = request.get_json()
        api_key = data.get('api_key')
        
        if not api_key:
            return jsonify({"success": False, "error": "未提供 API Key"}), 200
        
        print(f"[API] Fetching models with api_key: {api_key[:10]}...")
        
        client = get_client(api_key)
        models = client.models.list()
        
        model_names = []
        for m in models:
            name = m.name
            if name.startswith('models/'):
                name = name[7:]
            model_names.append(name)
        
        print(f"[API] Found {len(model_names)} models")
        return jsonify({"success": True, "models": model_names})
    
    except Exception as e:
        err_str = str(e)
        print(f"[API ERROR] list_models: {err_str}")
        clean_msg = err_str
        if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
            clean_msg = "请求过于频繁或 API 配额已耗尽 (429 RESOURCE_EXHAUSTED)。"
        elif "RemoteProtocolError" in err_str or "Server disconnected" in err_str:
            clean_msg = "网络代理连接中断，请检查本地代理工具（如 SOCKS5/Clash）是否稳定。"
        return jsonify({"success": False, "error": clean_msg}), 200

@app.route('/api/generate', methods=['POST'])
def generate_content():
    try:
        data = request.get_json()
        api_key = data.get('api_key')
        model = data.get('model')
        contents = data.get('contents')
        temperature = data.get('temperature', 0.7)
        
        if not api_key:
            return jsonify({"success": False, "error": "未提供 API Key"}), 200
        if not model:
            return jsonify({"success": False, "error": "未提供模型名称"}), 200
        if not contents:
            return jsonify({"success": False, "error": "未提供内容"}), 200
        
        print(f"[API] Generating content with model: {model}, api_key: {api_key[:10]}...")
        print(f"[API] Content length: {len(contents) if contents else 0}")
        
        client = get_client(api_key)

        response = None
        # Robust config compatibility for different versions of google-genai SDK
        try:
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config={"temperature": temperature}
            )
        except TypeError:
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=contents,
                    generation_config={"temperature": temperature}
                )
            except TypeError:
                response = client.models.generate_content(
                    model=model,
                    contents=contents
                )
        
        text = response.text if response else ""
        print(f"[API] Response length: {len(text) if text else 0}")
        return jsonify({"success": True, "text": text})
    
    except Exception as e:
        err_str = str(e)
        print(f"[API ERROR] generate_content: {err_str}")
        import traceback
        print(f"[API ERROR] Traceback: {traceback.format_exc()}")

        clean_msg = err_str
        if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
            clean_msg = f"模型 [{model}] 呼叫已超出 API 配额/频率限制 (429 RESOURCE_EXHAUSTED)。请在【设置】中更换其它模型或 API Key。"
        elif "RemoteProtocolError" in err_str or "Server disconnected" in err_str:
            clean_msg = f"网络代理连接中断或超时，请检查本地代理工具（SOCKS5/HTTP 节点）稳定性。"

        return jsonify({"success": False, "error": clean_msg}), 200

@app.route('/api/test-key', methods=['POST'])
def test_key():
    try:
        data = request.get_json()
        api_key = data.get('api_key')
        
        if not api_key:
            return jsonify({"success": False, "error": "未提供 API Key"}), 200
        
        client = get_client(api_key)
        model_names = []
        try:
            models = client.models.list()
            if models:
                for m in models:
                    name = m.name
                    if name.startswith('models/'):
                        name = name[7:]
                    model_names.append(name)
        except Exception as e:
            print(f"[API] Error listing models in test_key: {e}")

        if model_names:
            return jsonify({"success": True, "models": model_names})

        # Try generating content if list models failed
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents="Hello"
        )
        if response and response.text:
            return jsonify({"success": True, "models": []})
        else:
            return jsonify({"success": False, "error": "模型无响应"}), 200
    
    except Exception as e:
        err_str = str(e)
        clean_msg = err_str
        if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
            clean_msg = "API 配额超出限制 (429)。"
        elif "RemoteProtocolError" in err_str or "Server disconnected" in err_str:
            clean_msg = "代理网络连接超时或断开。"
        return jsonify({"success": False, "error": clean_msg}), 200

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"})

if __name__ == '__main__':
    print("[Gemini Proxy] Starting Python Flask server on http://localhost:5000")
    print("[Gemini Proxy] Using proxy:", os.environ.get('HTTPS_PROXY', 'Not set'))
    app.run(host='127.0.0.1', port=5000, debug=False)

