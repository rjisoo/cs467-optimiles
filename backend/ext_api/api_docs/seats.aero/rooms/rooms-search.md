---
updatedAt: 2026-09-08T04:45:04.000Z
agentTools:
  projectIndex: https://developers.seats.aero/llms.txt
---

# Search

Find hotels with award availability in an area and date range, with their cheapest rates.

Search is the [rooms.aero search page](https://rooms.aero/search) as an API. Give it an area and a range of check-in dates and it returns every hotel there with at least one award starting in that range, along with the cheapest standard and suite rates and the check-in dates they fall on. `start_date` and `end_date` bound when a stay begins, not when it ends; add `nights` (1 to 5) to look for one stay length, or leave it out for all.

Describe the area either as a bounding box (all four of `sw_lat`, `sw_lng`, `ne_lat`, `ne_lng`; zero is a valid edge, and the box may not cross the antimeridian) or as a `location` to geocode, such as a city, island or region name. Areas are limited to 500 hotels; for dense cities, narrow the box or add a `source` filter. Results come cheapest award first and paginate with `skip` and `take` like every other list.

Each result embeds the full hotel object, so you can go straight to [Get Availability](/reference/rooms-get-availability) with its `hotel.id` for the complete calendar.

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
      "SearchResult": {
        "type": "object",
        "description": "One hotel's cheapest options across the searched dates.",
        "properties": {
          "hotel": {
            "$ref": "#/components/schemas/Hotel"
          },
          "lowest_award_standard": {
            "type": "integer",
            "description": "Cheapest standard room award, in points. 0 when none.",
            "example": 25000
          },
          "lowest_award_suite": {
            "type": "integer",
            "description": "Cheapest suite award, in points. 0 when none.",
            "example": 60000
          },
          "lowest_cash_standard": {
            "type": "integer",
            "description": "Cheapest standard room cash rate, in the minor unit of currency_code. 0 when none.",
            "example": 90000
          },
          "lowest_cash_suite": {
            "type": "integer",
            "description": "Cheapest suite cash rate. 0 when none.",
            "example": 0
          },
          "currency_code": {
            "type": "string",
            "description": "ISO 4217 code for the cash rates.",
            "example": "USD"
          },
          "standard_date": {
            "type": "string",
            "description": "Check-in date (YYYY-MM-DD) of the cheapest standard rate. Empty when none.",
            "example": "2026-11-26"
          },
          "standard_nights": {
            "type": "integer",
            "description": "Stay length of the cheapest standard rate.",
            "example": 1
          },
          "suite_date": {
            "type": "string",
            "description": "Check-in date of the cheapest suite rate. Empty when none.",
            "example": "2026-11-21"
          },
          "suite_nights": {
            "type": "integer",
            "description": "Stay length of the cheapest suite rate.",
            "example": 1
          },
          "cpp": {
            "type": "number",
            "description": "The better cents-per-point of the two room classes, in US cents.",
            "example": 3
          },
          "last_checked_at": {
            "type": [
              "string",
              "null"
            ],
            "description": "Most recent retrieval among the hotel's matching dates. RFC 3339 timestamp.",
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
      "SearchResultList": {
        "type": "object",
        "description": "A page of matching hotels, cheapest award first.",
        "properties": {
          "data": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/SearchResult"
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
    "/search": {
      "get": {
        "summary": "Search",
        "description": "The Search page as an API: for an area and a range of check-in dates, every hotel with an award starting in that range and its cheapest standard and suite rates, cheapest award first. Give the area as a bounding box or as a place name to geocode. Areas are limited to 500 hotels; narrow the box or filter by source for dense cities.",
        "operationId": "rooms-search",
        "parameters": [
          {
            "name": "start_date",
            "in": "query",
            "description": "Earliest check-in date, YYYY-MM-DD. The dates bound when a stay may begin, not when it ends; use nights for the stay length.",
            "schema": {
              "type": "string"
            },
            "required": true
          },
          {
            "name": "end_date",
            "in": "query",
            "description": "Latest check-in date, YYYY-MM-DD. Must not be before start_date, and the range may not be entirely in the past.",
            "schema": {
              "type": "string"
            },
            "required": true
          },
          {
            "name": "sw_lat",
            "in": "query",
            "description": "South-west corner latitude of the bounding box, -90 to 90. Provide all four corners, or location. Zero is a valid edge.",
            "schema": {
              "type": "number"
            }
          },
          {
            "name": "sw_lng",
            "in": "query",
            "description": "South-west corner longitude, -180 to 180.",
            "schema": {
              "type": "number"
            }
          },
          {
            "name": "ne_lat",
            "in": "query",
            "description": "North-east corner latitude; must be north of sw_lat.",
            "schema": {
              "type": "number"
            }
          },
          {
            "name": "ne_lng",
            "in": "query",
            "description": "North-east corner longitude; must be east of sw_lng. Boxes may not cross the antimeridian; split the search instead.",
            "schema": {
              "type": "number"
            }
          },
          {
            "name": "location",
            "in": "query",
            "description": "A place to geocode instead of a bounding box, such as \"Tokyo\" or \"Maui\". Ignored when a complete bounding box is given.",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "nights",
            "in": "query",
            "description": "Only stays of exactly this many nights, 1 to 5. Omit for every stay length.",
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 5
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
            "name": "max_points",
            "in": "query",
            "description": "Only hotels with an award at or below this many points.",
            "schema": {
              "type": "integer"
            }
          },
          {
            "name": "min_cpp",
            "in": "query",
            "description": "Only hotels whose best award is worth at least this many US cents per point.",
            "schema": {
              "type": "number"
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
                  "$ref": "#/components/schemas/SearchResultList"
                },
                "examples": {
                  "Result": {
                    "value": {
                      "data": [
                        {
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
                            "lowest_award": 30000,
                            "standard_award_availability_percent": 41,
                            "standard_award_availability_window_days": 90,
                            "standard_award_availability_updated_at": "2026-09-07T04:10:22Z",
                            "last_checked_at": "2026-09-07T03:58:01Z",
                            "created_at": "2023-07-05T01:02:57Z",
                            "updated_at": "2026-09-07T04:10:22Z"
                          },
                          "lowest_award_standard": 25000,
                          "lowest_award_suite": 60000,
                          "lowest_cash_standard": 90000,
                          "lowest_cash_suite": 0,
                          "currency_code": "USD",
                          "standard_date": "2026-11-26",
                          "standard_nights": 1,
                          "suite_date": "2026-11-21",
                          "suite_nights": 1,
                          "cpp": 3,
                          "last_checked_at": "2026-09-07T03:58:01Z"
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
          "400": {
            "description": "Invalid or missing parameter, unknown location, or too many hotels",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                },
                "examples": {
                  "Result": {
                    "value": {
                      "error": "missing_parameter",
                      "message": "Provide a bounding box (sw_lat, sw_lng, ne_lat, ne_lng) or a location to search."
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