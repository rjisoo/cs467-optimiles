"""Flask app. Routes stay thin: validate input, call a logic module, return JSON."""

import json

from flask import Flask, jsonify, redirect, render_template, request, url_for
from pydantic import ValidationError

from backend.chat import handle_chat
from backend.models import ChatRequest, SearchCriteria, SearchResponse
from backend.openapi import build_openapi
from backend.search import search_awards


def create_app() -> Flask:
    app = Flask(__name__)

    @app.get("/")
    def index():
        return redirect(url_for("api_docs"))

    @app.get("/docs", strict_slashes=False)
    def api_docs():
        return render_template("swagger_ui.html")

    @app.get("/openapi.json")
    def openapi_spec():
        return jsonify(build_openapi(request.script_root or "/"))

    @app.errorhandler(ValidationError)
    def handle_validation_error(error: ValidationError):
        details = json.loads(error.json(include_url=False))
        return jsonify(error="Invalid request", details=details), 400

    @app.get("/api/health")
    def health():
        return jsonify(status="ok")

    @app.post("/api/search")
    def search():
        criteria = SearchCriteria.model_validate(_json_body())
        response = SearchResponse(results=search_awards(criteria))
        return jsonify(response.model_dump(mode="json"))

    @app.post("/api/chat")
    def chat():
        chat_request = ChatRequest.model_validate(_json_body())
        return jsonify(handle_chat(chat_request).model_dump(mode="json"))

    return app


def _json_body() -> dict:
    # A missing or malformed body validates as empty, producing a normal 400.
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else {}


app = create_app()
