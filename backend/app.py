"""Flask app. Routes stay thin: validate input, call a logic module, return JSON."""

import json

from flask import Flask, jsonify, redirect, render_template, request, url_for
from pydantic import ValidationError
from werkzeug.exceptions import HTTPException

from backend.chat import handle_chat
from backend.errors import UPSTREAM_ERRORS, describe_upstream_error
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

    @app.errorhandler(HTTPException)
    def handle_http_error(error: HTTPException):
        # JSON instead of Flask's HTML pages: 404, 405, and 500 for unhandled exceptions
        # (Flask logs those before calling this). get_response() keeps headers like Allow.
        response = error.get_response()
        response.set_data(json.dumps({"error": error.name.capitalize()}))
        response.mimetype = "application/json"
        return response

    def handle_upstream_error(error: Exception):
        status, message = describe_upstream_error(error)
        app.logger.warning("Award search failed", exc_info=error)
        return jsonify(error=message), status

    for error_class in UPSTREAM_ERRORS:
        app.register_error_handler(error_class, handle_upstream_error)

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
