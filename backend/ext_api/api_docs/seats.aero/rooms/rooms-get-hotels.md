---
updatedAt: 2026-09-08T03:38:08.000Z
agentTools:
  projectIndex: https://developers.seats.aero/llms.txt
---

# Get Hotels

Browse the hotel directory.

Lists every property rooms.aero tracks, ordered by name. Narrow it by `id` or `internal_id` (the program's own property code), program, country, state, city, brand code, award category, or a case-insensitive name search. There is no per-hotel endpoint: to fetch one hotel, pass its `id`. Each hotel carries `lowest_award`, the cheapest award seen on any upcoming date in the last two weeks, and the share of checked dates with any award available.

Pages hold up to 1,000 hotels. To load a whole program, page with `take=1000` and follow `more_url`.

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
      },
      "HotelList": {
        "type": "object",
        "description": "A page of hotels.",
        "properties": {
          "data": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Hotel"
            }
          },
          "count": {
            "type": "integer",
            "description": "Number of items in this response.",
            "example": 2
          },
          "has_more": {
            "type": "boolean",
            "description": "Whether another page exists.",
            "example": false
          },
          "more_url": {
            "type": "string",
            "description": "URL of the next page. Omitted on the last page."
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
    "/hotels": {
      "get": {
        "summary": "Get Hotels",
        "description": "The hotel directory: every property rooms.aero tracks, ordered by name, optionally narrowed by id, program, location, brand, award category or a name search. There is no per-hotel endpoint; pass id=<hotel id> to fetch one hotel.",
        "operationId": "rooms-get-hotels",
        "parameters": [
          {
            "name": "id",
            "in": "query",
            "description": "Only these hotels, by rooms.aero id. Comma-delimited if multiple, at most 100.",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "internal_id",
            "in": "query",
            "description": "Only these hotels, by the program's own property code (Hilton ctyhocn, Hyatt spirit code, Marriott property code, and so on). Comma-delimited if multiple, at most 100. Combine with source, since codes are only unique within a program.",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "source",
            "in": "query",
            "description": "Loyalty program key(s), comma-delimited if multiple, such as \"hyatt,hilton\". The keys are listed on the Concepts page.",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "country",
            "in": "query",
            "description": "Only hotels in these countries, by display name as shown on rooms.aero (for example \"United States\", \"Japan\"). Comma-delimited if multiple.",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "state",
            "in": "query",
            "description": "Only hotels in these states or regions. Comma-delimited if multiple.",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "city",
            "in": "query",
            "description": "Only hotels in these cities. Comma-delimited if multiple.",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "brand",
            "in": "query",
            "description": "Only these brand codes. Comma-delimited if multiple.",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "category",
            "in": "query",
            "description": "Only these award categories. Comma-delimited if multiple.",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "search",
            "in": "query",
            "description": "Case-insensitive substring match on the hotel name.",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "skip",
            "in": "query",
            "description": "How many results to skip. Pagination is skip/take: request the next page with skip = skip + take, or follow more_url.",
            "schema": {
              "type": "integer",
              "default": 0
            }
          },
          {
            "name": "take",
            "in": "query",
            "description": "Maximum results to return. Must be between 1 and 1000.",
            "schema": {
              "type": "integer",
              "default": 100,
              "minimum": 1,
              "maximum": 1000
            }
          }
        ],
        "responses": {
          "200": {
            "description": "200",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/HotelList"
                },
                "examples": {
                  "Result": {
                    "value": {
                      "data": [
                        {
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
                          "lowest_award": 30000,
                          "standard_award_availability_percent": 41,
                          "standard_award_availability_window_days": 90,
                          "standard_award_availability_updated_at": "2026-09-07T04:10:22Z",
                          "last_checked_at": "2026-09-07T03:58:01Z",
                          "created_at": "2023-07-05T01:02:57Z",
                          "updated_at": "2026-09-07T04:10:22Z"
                        }
                      ],
                      "count": 1,
                      "has_more": true,
                      "more_url": "https://rooms.aero/partnerapi/hotels?skip=1&source=hyatt&take=1"
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Invalid parameter",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                },
                "examples": {
                  "Result": {
                    "value": {
                      "error": "invalid_parameter",
                      "message": "The source parameter is invalid: \"nope\" is not a known source; use one of choice, hilton, hyatt, ihg, iprefer, marriott, wyndham."
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