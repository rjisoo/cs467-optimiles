---
updatedAt: 2026-09-08T03:38:08.000Z
agentTools:
  projectIndex: https://developers.seats.aero/llms.txt
---

# Get Alerts

List the alerts on your account.

Lists the alerts on your Rooms.aero account, newest first. Alerts are created and deleted on the site at [rooms.aero/alerts](https://rooms.aero/alerts) and [rooms.aero/alerts/manage](https://rooms.aero/alerts/manage); the API is read-only, as with the Seats.aero partner API. One-off alerts that have already fired are hidden unless you pass `include_expired=true`. This endpoint requires a Pro user's API key.

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
      "Alert": {
        "type": "object",
        "description": "A notification request on the caller's rooms.aero account. Alerts are created and deleted on the rooms.aero site; the API lists them.",
        "properties": {
          "id": {
            "type": "string",
            "description": "Identifier for the alert."
          },
          "hotel_id": {
            "type": "string",
            "description": "The hotel being watched."
          },
          "hotel": {
            "$ref": "#/components/schemas/Hotel"
          },
          "date_type": {
            "type": "string",
            "description": "fixed_date, date_range or any_date.",
            "enum": [
              "fixed_date",
              "date_range",
              "any_date"
            ],
            "example": "fixed_date"
          },
          "arrival_date_start": {
            "type": "string",
            "description": "First acceptable check-in date (YYYY-MM-DD). Empty for any_date; equal to arrival_date_end for fixed_date.",
            "example": "2026-11-21"
          },
          "arrival_date_end": {
            "type": "string",
            "description": "Last acceptable check-in date (YYYY-MM-DD). Empty for any_date.",
            "example": "2026-11-21"
          },
          "num_nights": {
            "type": "integer",
            "description": "Length of stay the alert watches, 1 to 5.",
            "example": 2
          },
          "alert_mode": {
            "type": "string",
            "description": "one_off fires once and then expires; continuous keeps notifying about new or cheaper matches until deleted.",
            "enum": [
              "one_off",
              "continuous"
            ],
            "example": "one_off"
          },
          "channel": {
            "type": "string",
            "description": "Delivery channel. API alerts are always email.",
            "example": "email"
          },
          "email_address": {
            "type": "string",
            "description": "The account email the alert is delivered to."
          },
          "standard_room": {
            "type": "boolean",
            "description": "Match standard room awards."
          },
          "suite_room": {
            "type": "boolean",
            "description": "Match suite awards."
          },
          "max_points": {
            "type": "integer",
            "description": "Highest acceptable award, in points. 0 means any price.",
            "example": 40000
          },
          "expired": {
            "type": "boolean",
            "description": "Whether a one-off alert has already fired."
          },
          "created_at": {
            "type": "string",
            "description": "When the alert was created. RFC 3339 timestamp.",
            "format": "date-time"
          },
          "updated_at": {
            "type": "string",
            "description": "When the alert last changed. RFC 3339 timestamp.",
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
      "AlertList": {
        "type": "object",
        "description": "A page of alerts.",
        "properties": {
          "data": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Alert"
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
    "/alerts": {
      "get": {
        "summary": "Get Alerts",
        "description": "Lists the alerts on your rooms.aero account, newest first. Alerts are created and deleted at https://rooms.aero/alerts; the API is read-only. Expired one-off alerts are left out unless include_expired is set. Requires a Pro user's API key.",
        "operationId": "rooms-get-alerts",
        "parameters": [
          {
            "name": "include_expired",
            "in": "query",
            "description": "Include one-off alerts that have already fired.",
            "schema": {
              "type": "boolean",
              "default": false
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
            "description": "Maximum results to return. Must be between 1 and 500.",
            "schema": {
              "type": "integer",
              "default": 100,
              "minimum": 1,
              "maximum": 500
            }
          }
        ],
        "responses": {
          "200": {
            "description": "200",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/AlertList"
                },
                "examples": {
                  "Result": {
                    "value": {
                      "data": [
                        {
                          "id": "2T3xQmZfR2u9hL0b8VfQ1JkYcAa",
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
                          "date_type": "fixed_date",
                          "arrival_date_start": "2026-11-21",
                          "arrival_date_end": "2026-11-21",
                          "num_nights": 2,
                          "alert_mode": "one_off",
                          "channel": "email",
                          "email_address": "you@example.com",
                          "standard_room": true,
                          "suite_room": true,
                          "max_points": 40000,
                          "expired": false,
                          "created_at": "2026-09-07T15:04:05Z",
                          "updated_at": "2026-09-07T15:04:05Z"
                        }
                      ],
                      "count": 1,
                      "has_more": false
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
          "403": {
            "description": "Not a Pro user's key",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                },
                "examples": {
                  "Result": {
                    "value": {
                      "error": "pro_user_required",
                      "message": "Alerts belong to your rooms.aero account. This endpoint requires a Pro user's API key."
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