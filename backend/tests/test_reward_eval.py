import pytest
import json
from pathlib import Path
from ext_api import init_reward_eval, get_all_reward_info, get_reward_value, get_banks
import copy
import os

original_file_path = Path("backend/config/reward_program_info.json")
with open(original_file_path, "r", encoding="utf-8") as f:
    original_json = json.loads(f.read())


def test_reward_eval_initialization():
    # Initialize the reward evaluation module
    init_reward_eval()
    # Check that reward programs are loaded
    reward_info = get_all_reward_info()
    assert isinstance(reward_info, dict)
    assert len(reward_info) == len(original_json)


def test_get_reward_value():
    # Test with a known bank and points
    points = 1000
    banks = ["Chase", "Amex"]
    result = get_reward_value(points, banks)
    assert isinstance(result, list)
    for entry in result:
        assert (
            entry["cash_value"] == original_json[entry["bank"]]["point_value"] * points
        )
        assert entry["logo_url"] == original_json[entry["bank"]]["logo_url"]
        assert entry["full_name"] == original_json[entry["bank"]]["full_name"]
        assert entry["points"] == points
        assert entry["point_value"] == original_json[entry["bank"]]["point_value"]


def test_get_all_reward_info():
    reward_info = get_all_reward_info()
    assert isinstance(reward_info, dict)
    assert reward_info == original_json


def test_get_banks():
    banks = get_banks()
    assert isinstance(banks, list)
    assert set(banks) == set(original_json.keys())


def test_reinitialize_reward_eval(monkeypatch):
    new_json = copy.deepcopy(original_json)
    new_json["TestBank"] = {
        "full_name": "Test Bank",
        "point_value": 0.02,
        "logo_url": "https://example.com/testbank_logo.png",
    }
    test_file_path = Path("backend/config/test_reward_program_info.json")

    with open(test_file_path, "w", encoding="utf-8") as file:
        json.dump(new_json, file, indent=4)

    monkeypatch.setenv(
        "REWARD_PROGRAM_VALUE_INFO_PATH", "backend/config/test_reward_program_info.json"
    )

    init_reward_eval()
    reward_info = get_all_reward_info()
    assert "TestBank" in reward_info
    assert reward_info["TestBank"]["full_name"] == "Test Bank"
    assert reward_info["TestBank"]["point_value"] == 0.02
    assert (
        reward_info["TestBank"]["logo_url"] == "https://example.com/testbank_logo.png"
    )
    os.remove(test_file_path)
