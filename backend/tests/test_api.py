from backend.chat import NOT_CONFIGURED_REPLY
from backend.models import ChatResponse

VALID_SEARCH = {
    "origin": "sfo",
    "destination": "NRT",
    "departure_date": "2026-12-01",
    "cabin": "business",
    "passengers": 2,
}


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}


def test_search_returns_results(client):
    response = client.post("/api/search", json=VALID_SEARCH)
    assert response.status_code == 200
    results = response.get_json()["results"]
    assert results
    for result in results:
        assert result["origin"] == "SFO"
        assert result["cabin"] == "business"
        assert result["seats_available"] >= 2


def test_search_rejects_same_origin_and_destination(client):
    response = client.post("/api/search", json={**VALID_SEARCH, "destination": "SFO"})
    assert response.status_code == 400
    assert response.get_json()["error"] == "Invalid request"


def test_search_rejects_return_before_departure(client):
    response = client.post("/api/search", json={**VALID_SEARCH, "return_date": "2026-11-01"})
    assert response.status_code == 400


def test_search_rejects_missing_body(client):
    response = client.post("/api/search")
    assert response.status_code == 400


def test_chat_returns_reply(client, monkeypatch):
    def fake_run_chat(request):
        assert request.message == "Tokyo in December?"
        return ChatResponse(reply="Where are you flying from?", results=[])

    monkeypatch.setattr("backend.chat.run_chat", fake_run_chat)
    response = client.post("/api/chat", json={"message": "Tokyo in December?", "history": []})
    assert response.status_code == 200
    assert response.get_json() == {"reply": "Where are you flying from?", "results": []}


def test_chat_without_api_key_says_not_connected(client, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "")
    response = client.post("/api/chat", json={"message": "Tokyo in December?"})
    assert response.status_code == 200
    assert response.get_json() == {"reply": NOT_CONFIGURED_REPLY, "results": []}


def test_chat_rejects_empty_message(client):
    response = client.post("/api/chat", json={"message": ""})
    assert response.status_code == 400
