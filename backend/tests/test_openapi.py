import pytest

from backend.models import ChatRequest, ChatResponse, SearchCriteria, SearchResponse


def test_root_opens_docs(client):
    response = client.get("/")
    assert response.status_code == 302
    assert response.headers["Location"] == "/docs"


@pytest.mark.parametrize("path", ["/docs", "/docs/"])
def test_swagger_page_loads_local_schema(client, path):
    response = client.get(path)
    assert response.status_code == 200
    assert response.mimetype == "text/html"
    html = response.get_data(as_text=True)
    assert "SwaggerUIBundle" in html
    assert 'url: "/openapi.json"' in html
    assert "validatorUrl: null" in html


def test_openapi_covers_all_api_routes_and_resolves_references(client):
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert response.mimetype == "application/json"
    spec = response.get_json()
    assert spec["openapi"] == "3.1.0"
    assert spec["servers"] == [{"url": "/"}]
    actual_routes = {
        (rule.rule, method.lower())
        for rule in client.application.url_map.iter_rules()
        if rule.rule.startswith("/api/")
        for method in rule.methods - {"HEAD", "OPTIONS"}
    }
    documented_routes = {
        (path, method) for path, operations in spec["paths"].items() for method in operations
    }
    assert documented_routes == actual_routes

    def check_refs(value):
        if isinstance(value, dict):
            if "$ref" in value:
                assert value["$ref"].startswith("#/components/schemas/")
                target = spec
                for part in value["$ref"].split("/")[1:]:
                    target = target[part]
            for child in value.values():
                check_refs(child)
        elif isinstance(value, list):
            for child in value:
                check_refs(child)

    check_refs(spec)


@pytest.mark.parametrize(
    ("path", "request_model", "response_model"),
    [
        ("/api/search", SearchCriteria, SearchResponse),
        ("/api/chat", ChatRequest, ChatResponse),
    ],
)
def test_documented_examples_work_and_errors_are_documented(
    client, monkeypatch, path, request_model, response_model
):
    # Documentation tests must never call the real Gemini API.
    monkeypatch.setattr("backend.chat.run_chat", lambda request: ChatResponse(reply="Example reply"))
    operation = client.get("/openapi.json").get_json()["paths"][path]["post"]
    example = operation["requestBody"]["content"]["application/json"]["example"]
    request_model.model_validate(example)
    response = client.post(path, json=example)
    assert response.status_code == 200
    response_model.model_validate(response.get_json())

    invalid_response = client.post(path, json={})
    assert invalid_response.status_code == 400
    assert "400" in operation["responses"]
    assert invalid_response.get_json()["error"] == "Invalid request"


def test_docs_and_requests_follow_application_mount_path(client):
    environment = {"SCRIPT_NAME": "/optimiles"}
    html = client.get("/docs", environ_overrides=environment).get_data(as_text=True)
    assert 'url: "/optimiles/openapi.json"' in html
    spec = client.get("/openapi.json", environ_overrides=environment).get_json()
    assert spec["servers"] == [{"url": "/optimiles"}]
