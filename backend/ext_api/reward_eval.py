import logging
import json
from pathlib import Path
import os

logger = logging.getLogger(__name__)

reward_program_info_path = None
reward_programs=None

def init_reward_eval():
    global reward_program_info_path, reward_programs
    reward_program_info_path = Path(os.getenv("REWARD_PROGRAM_VALUE_INFO_PATH"))
    try:
        with open(reward_program_info_path, "r", encoding="utf-8") as f:
            reward_programs = json.load(f)
        logging.info("Reward evaluation module initialized from %s", reward_program_info_path)
    except FileNotFoundError:
        logging.error("Reward program info file not found: %s", reward_program_info_path)
    except json.JSONDecodeError as e:
        logging.error("Error decoding JSON from reward program info file: %s", e)
    except Exception as e:
        logging.error("Unexpected error occurred: %s", e)

def get_bank_image_link(bank_name):
    bank_info = reward_programs.get(bank_name)
    if bank_info is None:
        logger.error("Bank %s not found in reward programs.", bank_name)
        return None
    return bank_info.get("logo_url")

def get_all_bank_images_links():
    bank_images = {}
    for bank_name, bank_info in reward_programs.items():
        logo_url = bank_info.get("logo_url")
        if logo_url:
            bank_images[bank_name] = logo_url
        else:
            logger.warning("No logo URL found for bank %s.", bank_name)
    return bank_images

def get_all_reward_info():
    """Get reward values and logo URLs for all banks."""
    return reward_programs

def get_reward_value(points: int, banks: list[str])-> list[dict]:
    """Get reward value for a given number of points and a list of banks.
    return: list of dicts with bank name, full name, points, value, and logo_url
    """
    result = []
    for bank in banks:
        if bank in reward_programs:
            result.append({
                "bank": bank,
                "full_name": reward_programs[bank]["full_name"],
                "points": points,
                "point_value": reward_programs[bank]["point_value"],
                "cash_value": reward_programs[bank]["point_value"] * points,
                "logo_url": reward_programs[bank]["logo_url"]
            })
    return result

def get_banks() -> list[str]:
    """Get a list of all banks."""
    return list(reward_programs.keys())
