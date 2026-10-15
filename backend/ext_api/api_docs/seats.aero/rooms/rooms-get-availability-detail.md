---
updatedAt: 2026-09-08T04:46:22.000Z
agentTools:
  projectIndex: https://developers.seats.aero/llms.txt
---

# Get Availability Details

Retrieve one date with every room type, prices and a booking link.

Given an availability `id` from Get Availability, returns the full object with its hotel, a booking link for that exact stay, and every room type seen on the date, cheapest award first. Rooms without an award rate come last.

# OpenAPI definition

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "rooms-api",
    "version": "1.0",
    "description": "The rooms.aero API exposes hotel award availability across every supported loyalty program. Authenticate with your seats.aero API key, or a Login with Seats.aero access token as \"Bearer seats:ota:...\", in the Partner-Authorization header."
  },
  "servers": [
    {
      "url": "https://rooms.aero/partnerapi/"
    }
  ],
  "components": {
    "securitySchemes": {
      "sec0": {
        "type": "apiKey",
        "in": "header",
        "name": "Partner-Authorization",
        "description": "A seats.aero Pro API key (pro_...), or a Login with Seats.aero access token with a Bearer prefix (Bearer seats:ota:...)."
      }
    },
    "schemas": {
      "Hotel": {
        "type": "object",
        "description": "One property in one loyalty program. The same object is returned by every endpoint that mentions a hotel.",
        "properties": {
          "id": {
            "type": "string",
            "description": "rooms.aero's identifier for the hotel. Use it as hotel_id on the other endpoints.",
            "example": "2PPrELk9WcfJaNREWEPXypvhXAD"
          },
          "source": {
            "type": "string",
            "description": "The loyalty program key. The keys are listed on the Concepts page.",
            "example": "hyatt"
          },
          "program": {
            "type": "string",
            "description": "The loyalty program's display name.",
            "example": "World of Hyatt"
          },
          "name": {
            "type": "string",
            "description": "Hotel name.",
            "example": "Park Hyatt Tokyo"
          },
          "brand": {
            "type": "string",
            "description": "Program-specific brand code. The Concepts page maps codes to names.",
            "example": "park"
          },
          "award_category": {
            "type": "string",
            "description": "Program-specific award category, for programs with an award chart. Empty otherwise.",
            "example": "7"
          },
          "address": {
            "type": "string",
            "description": "Street address as published by the program.",
            "example": "3-7-1-2 Nishi Shinjuku, Shinjuku-Ku"
          },
          "city": {
            "type": "string",
            "description": "City.",
            "example": "Tokyo"
          },
          "state": {
            "type": "string",
            "description": "State, province or region; may be empty.",
            "example": ""
          },
          "country": {
            "type": "string",
            "description": "Country, as a display name.",
            "example": "Japan"
          },
          "latitude": {
            "type": "number",
            "description": "Latitude in decimal degrees.",
            "example": 35.6852
          },
          "longitude": {
            "type": "number",
            "description": "Longitude in decimal degrees.",
            "example": 139.6891
          },
          "image_url": {
            "type": "string",
            "description": "A representative photo, when the program publishes one.",
            "example": "https://assets.hyatt.com/content/dam/hyatt/hyattdam/images/2018/03/02/1141/Park-Hyatt-Tokyo-P011-Exterior.jpg"
          },
          "description": {
            "type": "string",
            "description": "Short description from the program; may be empty."
          },
          "internal_id": {
            "type": "string",
            "description": "The program's own property code (Hilton ctyhocn, Hyatt spirit code, Marriott property code, and so on).",
            "example": "tyoph"
          },
          "open": {
            "type": "boolean",
            "description": "Whether the property is open.",
            "example": true
          },
          "url": {
            "type": "string",
            "description": "The hotel's page on rooms.aero.",
            "example": "https://rooms.aero/hyatt/hotel/2PPrELk9WcfJaNREWEPXypvhXAD"
          },
          "lowest_award": {
            "type": [
              "integer",
              "null"
            ],
            "description": "The cheapest award, in points, seen for any upcoming date in the last two weeks. Null when none is known. Populated by Get Hotels and Search; omitted from availability rows.",
            "example": 30000
          },
          "standard_award_availability_percent": {
            "type": [
              "integer",
              "null"
            ],
            "description": "Share of checked upcoming dates with any award available, over standard_award_availability_window_days. Null until enough dates have been checked.",
            "example": 41
          },
          "standard_award_availability_window_days": {
            "type": [
              "integer",
              "null"
            ],
            "description": "The window the percentage was measured over.",
            "example": 90
          },
          "standard_award_availability_updated_at": {
            "type": [
              "string",
              "null"
            ],
            "description": "When the percentage was last recomputed. RFC 3339 timestamp.",
            "format": "date-time"
          },
          "last_checked_at": {
            "type": [
              "string",
              "null"
            ],
            "description": "When the property's rates were last retrieved. Null if never. RFC 3339 timestamp.",
            "format": "date-time"
          },
          "created_at": {
            "type": "string",
            "description": "When rooms.aero started tracking the hotel. RFC 3339 timestamp.",
            "format": "date-time"
          },
          "updated_at": {
            "type": "string",
            "description": "When the hotel record last changed. RFC 3339 timestamp.",
            "format": "date-time"
          }
        }
      },
      "BookingLink": {
        "type": "object",
        "description": "A deep link into the program's own booking flow for this stay.",
        "properties": {
          "label": {
            "type": "string",
            "description": "Text to show on the link.",
            "example": "Book via World of Hyatt"
          },
          "url": {
            "type": "string",
            "description": "The booking URL.",
            "example": "https://www.hyatt.com/shop/rooms/tyoph?checkinDate=2026-11-21&checkoutDate=2026-11-22&rooms=1&adults=1&kids=0&rate=Standard&rateFilter=woh&utm_source=roomsaero"
          }
        }
      },
      "Room": {
        "type": "object",
        "description": "One room type offered on one availability.",
        "properties": {
          "id": {
            "type": "string",
            "description": "Identifier for the room offer."
          },
          "availability_id": {
            "type": "string",
            "description": "The availability this room belongs to."
          },
          "hotel_id": {
            "type": "string",
            "description": "The hotel."
          },
          "source": {
            "type": "string",
            "description": "The loyalty program key.",
            "example": "hyatt"
          },
          "room_code": {
            "type": "string",
            "description": "The program's room type code.",
            "example": "KING"
          },
          "name": {
            "type": "string",
            "description": "Room type name.",
            "example": "1 King Bed"
          },
          "description": {
            "type": "string",
            "description": "Plain-text description; the program's HTML is stripped."
          },
          "image_url": {
            "type": "string",
            "description": "A photo of the room type, when available."
          },
          "suite": {
            "type": "boolean",
            "description": "Whether rooms.aero classifies this room as a suite."
          },
          "accessible": {
            "type": "boolean",
            "description": "Whether the room is an accessible room type."
          },
          "award_cost": {
            "type": "integer",
            "description": "Points for the whole stay. 0 when no award rate was offered.",
            "example": 30000
          },
          "cash_cost": {
            "type": "integer",
            "description": "Cash for the whole stay, in the minor unit (cents) of cash_cost_currency. 0 when no cash rate was offered.",
            "example": 68500
          },
          "cash_cost_currency": {
            "type": "string",
            "description": "ISO 4217 code for cash_cost.",
            "example": "USD"
          },
          "arrival_date": {
            "type": "string",
            "description": "Check-in date. Formatted YYYY-MM-DD.",
            "example": "2026-11-21"
          },
          "departure_date": {
            "type": "string",
            "description": "Check-out date. Formatted YYYY-MM-DD.",
            "example": "2026-11-22"
          },
          "num_nights": {
            "type": "integer",
            "description": "Length of stay.",
            "example": 1
          },
          "last_checked_at": {
            "type": "string",
            "description": "When this room offer was last seen. RFC 3339 timestamp.",
            "format": "date-time"
          }
        }
      },
      "Availability": {
        "type": "object",
        "description": "One hotel on one arrival date for one stay length: the cheapest standard room and the cheapest suite, in points and in cash. A cost of 0 with its *_available flag false means the rate was not offered; an *_available flag of true always comes with a non-zero cost.",
        "properties": {
          "id": {
            "type": "string",
            "description": "Identifier for the availability. Use it with Get Availability Details.",
            "example": "2S8Cm9dHORWWKpoCkxfRkZa0e5l"
          },
          "hotel_id": {
            "type": "string",
            "description": "The hotel.",
            "example": "2PPrELk9WcfJaNREWEPXypvhXAD"
          },
          "hotel": {
            "$ref": "#/components/schemas/Hotel"
          },
          "source": {
            "type": "string",
            "description": "The loyalty program key.",
            "example": "hyatt"
          },
          "arrival_date": {
            "type": "string",
            "description": "Check-in date. Formatted YYYY-MM-DD.",
            "example": "2026-11-21"
          },
          "departure_date": {
            "type": "string",
            "description": "Check-out date. Formatted YYYY-MM-DD.",
            "example": "2026-11-22"
          },
          "num_nights": {
            "type": "integer",
            "description": "Length of stay.",
            "example": 1
          },
          "cash_currency_code": {
            "type": "string",
            "description": "ISO 4217 code for every cash cost on this object. Cash costs are in the currency's minor unit (cents) for the whole stay.",
            "example": "USD"
          },
          "standard_award_available": {
            "type": "boolean",
            "description": "Whether a standard room was bookable with points.",
            "example": true
          },
          "standard_award_cost": {
            "type": "integer",
            "description": "Cheapest standard room award, in points.",
            "example": 30000
          },
          "standard_cash_available": {
            "type": "boolean",
            "description": "Whether a standard room was bookable for cash.",
            "example": true
          },
          "standard_cash_cost": {
            "type": "integer",
            "description": "Cheapest standard room cash rate, in the minor unit of cash_currency_code.",
            "example": 68500
          },
          "standard_cpp": {
            "type": "number",
            "description": "Cash value of each point for the standard room, in US cents, when both rates were seen; 0 otherwise.",
            "example": 2.28
          },
          "suite_award_available": {
            "type": "boolean",
            "description": "Whether a suite was bookable with points.",
            "example": false
          },
          "suite_award_cost": {
            "type": "integer",
            "description": "Cheapest suite award, in points.",
            "example": 0
          },
          "suite_cash_available": {
            "type": "boolean",
            "description": "Whether a suite was bookable for cash.",
            "example": false
          },
          "suite_cash_cost": {
            "type": "integer",
            "description": "Cheapest suite cash rate, in the minor unit of cash_currency_code.",
            "example": 0
          },
          "suite_cpp": {
            "type": "number",
            "description": "Cash value of each point for the suite, in US cents; 0 when either rate is missing.",
            "example": 0
          },
          "booking_link": {
            "$ref": "#/components/schemas/BookingLink"
          },
          "rooms": {
            "type": "array",
            "description": "Every room type seen on this date, cheapest award first. Only Get Availability Details includes rooms.",
            "items": {
              "$ref": "#/components/schemas/Room"
            }
          },
          "last_checked_at": {
            "type": "string",
            "description": "When this date's rates were last retrieved. RFC 3339 timestamp.",
            "format": "date-time"
          },
          "created_at": {
            "type": "string",
            "description": "When this date was first seen. RFC 3339 timestamp.",
            "format": "date-time"
          }
        }
      },
      "Error": {
        "type": "object",
        "description": "Every non-2xx response has this shape.",
        "properties": {
          "error": {
            "type": "string",
            "description": "Stable, machine-readable code. See Concepts for the full list.",
            "example": "invalid_parameter"
          },
          "message": {
            "type": "string",
            "description": "Human-readable explanation.",
            "example": "The nights parameter is invalid: must be between 1 and 5."
          }
        }
      }
    }
  },
  "security": [
    {
      "sec0": []
    }
  ],
  "paths": {
    "/availability/{id}": {
      "get": {
        "summary": "Get Availability Details",
        "description": "One availability with its hotel, a booking link and every room type seen on that date, cheapest award first.",
        "operationId": "rooms-get-availability-detail",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "description": "The availability id, from Get Availability.",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "200",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Availability"
                },
                "examples": {
                  "Result": {
                    "value": {
                      "id": "2S8Cm9dHORWWKpoCkxfRkZa0e5l",
                      "hotel_id": "2PPrELk9WcfJaNREWEPXypvhXAD",
                      "hotel": {
                        "id": "2PPrELk9WcfJaNREWEPXypvhXAD",
                        "source": "hyatt",
                        "program": "World of Hyatt",
                        "name": "Park Hyatt Tokyo",
                        "brand": "park",
                        "award_category": "7",
                        "address": "3-7-1-2 Nishi Shinjuku, Shinjuku-Ku",
                        "city": "Tokyo",
                        "state": "",
                        "country": "Japan",
                        "latitude": 35.6852,
                        "longitude": 139.6891,
                        "image_url": "https://assets.hyatt.com/content/dam/hyatt/hyattdam/images/2018/03/02/1141/Park-Hyatt-Tokyo-P011-Exterior.jpg",
                        "description": "Perched on the top 14 floors of the 52-story Shinjuku Park Tower.",
                        "internal_id": "tyoph",
                        "open": true,
                        "url": "https://rooms.aero/hyatt/hotel/2PPrELk9WcfJaNREWEPXypvhXAD",
                        "standard_award_availability_percent": 41,
                        "standard_award_availability_window_days": 90,
                        "standard_award_availability_updated_at": "2026-09-07T04:10:22Z",
                        "last_checked_at": "2026-09-07T03:58:01Z",
                        "created_at": "2023-07-05T01:02:57Z",
                        "updated_at": "2026-09-07T04:10:22Z"
                      },
                      "source": "hyatt",
                      "arrival_date": "2026-11-21",
                      "departure_date": "2026-11-22",
                      "num_nights": 1,
                      "cash_currency_code": "USD",
                      "standard_award_available": true,
                      "standard_award_cost": 30000,
                      "standard_cash_available": true,
                      "standard_cash_cost": 68500,
                      "standard_cpp": 2.28,
                      "suite_award_available": false,
                      "suite_award_cost": 0,
                      "suite_cash_available": false,
                      "suite_cash_cost": 0,
                      "suite_cpp": 0,
                      "booking_link": {
                        "label": "Book via World of Hyatt",
                        "url": "https://www.hyatt.com/shop/rooms/tyoph?checkinDate=2026-11-21&checkoutDate=2026-11-22&rooms=1&adults=1&kids=0&rate=Standard&rateFilter=woh&utm_source=roomsaero"
                      },
                      "last_checked_at": "2026-09-07T03:58:01Z",
                      "created_at": "2026-08-30T02:11:40Z",
                      "rooms": [
                        {
                          "id": "2S8CmA8bXa9KHaxZfUtihUzRTPd",
                          "availability_id": "2S8Cm9dHORWWKpoCkxfRkZa0e5l",
                          "hotel_id": "2PPrELk9WcfJaNREWEPXypvhXAD",
                          "source": "hyatt",
                          "room_code": "KING",
                          "name": "1 King Bed",
                          "description": "Room with 1 King Bed, 45 sq m, park or city view.",
                          "image_url": "",
                          "suite": false,
                          "accessible": false,
                          "award_cost": 30000,
                          "cash_cost": 68500,
                          "cash_cost_currency": "USD",
                          "arrival_date": "2026-11-21",
                          "departure_date": "2026-11-22",
                          "num_nights": 1,
                          "last_checked_at": "2026-09-07T03:58:01Z"
                        },
                        {
                          "id": "2S8CmEryWzLYnioVN6fJ2Ue5Lg8",
                          "availability_id": "2S8Cm9dHORWWKpoCkxfRkZa0e5l",
                          "hotel_id": "2PPrELk9WcfJaNREWEPXypvhXAD",
                          "source": "hyatt",
                          "room_code": "PSTE",
                          "name": "Park Suite King",
                          "description": "Suite with 1 King Bed and separate living room.",
                          "image_url": "",
                          "suite": true,
                          "accessible": false,
                          "award_cost": 0,
                          "cash_cost": 152000,
                          "cash_cost_currency": "USD",
                          "arrival_date": "2026-11-21",
                          "departure_date": "2026-11-22",
                          "num_nights": 1,
                          "last_checked_at": "2026-09-07T03:58:01Z"
                        }
                      ]
                    }
                  }
                }
              }
            }
          },
          "401": {
            "description": "Missing, unknown or unsubscribed credentials: missing_partner_key, bad_partner_key, bad_partner_token, invalid_scope or user_subscription_expired",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                },
                "examples": {
                  "Unknown API key": {
                    "value": {
                      "error": "bad_partner_key",
                      "message": "The API key in the Partner-Authorization header was not recognized. Pro users can find their key in the API tab at https://seats.aero/settings."
                    }
                  },
                  "Expired or revoked OAuth token": {
                    "value": {
                      "error": "bad_partner_token",
                      "message": "The OAuth access token in the Partner-Authorization header was not recognized, has expired, or was revoked. Obtain a new one with your refresh token, or ask the user to authorize your application again."
                    }
                  }
                }
              }
            }
          },
          "404": {
            "description": "Unknown availability",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                },
                "examples": {
                  "Result": {
                    "value": {
                      "error": "availability_not_found",
                      "message": "No availability has that id."
                    }
                  }
                }
              }
            }
          },
          "429": {
            "description": "Daily quota exhausted",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                },
                "examples": {
                  "Result": {
                    "value": {
                      "error": "user_rate_limit_exceeded",
                      "message": "You have used all 1000 of today's API calls. The quota resets at midnight UTC."
                    }
                  }
                }
              }
            }
          }
        },
        "deprecated": false
      }
    }
  },
  "x-readme": {
    "headers": [],
    "explorer-enabled": true,
    "proxy-enabled": true
  },
  "x-readme-fauxas": true
}
```