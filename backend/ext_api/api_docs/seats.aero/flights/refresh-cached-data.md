---
updatedAt: 2026-07-25T01:35:04.000Z
agentTools:
  projectIndex: https://developers.seats.aero/llms.txt
---

# Refresh Cached Data

Use this endpoint to refresh old cached data.

<Callout icon="🚧" theme="warn">
  ### Commercial Users

  The Refresh Cached Data API cannot be used by commercial users at this time. Use the Live Search API instead.
</Callout>

Use this endpoint to refresh old data. If an availability object you care about has not been updated recently, you can request an updated copy here.

This API is a single idempotent endpoint that both queues a refresh and reports the status. Each call queues whichever of the given items are stale (not updated in the last 3 hours) and not already being refreshed, and reports the current state of everything else, so you poll by repeating the same call until `complete` is true. Queued items are typically refreshed within a minute.

Refreshing cached data is an async, queued process on the seats.aero backend. This queue can overfill or experience low success rates at times. You should gracefully handle failed refreshes and not attempt to retry them for 15 minutes.

## Quota

Each newly queued item consumes one call from your daily API quota. If an item is ineligible or has already been queued, it will not consume any quota to call the API again and check its status.

If a queued refresh fails, its credit is refunded automatically, and the item sits out a short cooldown (about 15 minutes) before it can be queued and charged again. Separately from the quota, raw calls to this endpoint are capped at 2,000 per hour per user.

# OpenAPI definition

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "partner-api",
    "version": "1.0"
  },
  "servers": [
    {
      "url": "https://seats.aero/partnerapi/"
    }
  ],
  "components": {
    "securitySchemes": {
      "sec0": {
        "type": "apiKey",
        "in": "header",
        "name": "Partner-Authorization"
      }
    }
  },
  "security": [
    {
      "sec0": []
    }
  ],
  "paths": {
    "/refresh": {
      "post": {
        "summary": "Refresh Cached Data",
        "description": "Use this endpoint to refresh old cached data.",
        "operationId": "create-refresh",
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "availability_ids"
                ],
                "properties": {
                  "availability_ids": {
                    "type": "array",
                    "description": "1 to 250 availability object IDs, as returned by /search or /availability. Duplicates are ignored.",
                    "items": {
                      "type": "string",
                      "example": "2v37fWFcRCmlct2SFweD9Np5cVH"
                    },
                    "minItems": 1,
                    "maxItems": 250
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "200",
            "content": {
              "application/json": {
                "examples": {
                  "Result": {
                    "value": "{\n    \"items\": [\n        {\n            \"availability_id\": \"2v37fWFcRCmlct2SFweD9Np5cVH\",\n            \"status\": \"queued\",\n            \"updated_at\": \"2026-07-20T14:02:11Z\"\n        },\n        {\n            \"availability_id\": \"2v37fS4eggp7hpqwzBQbpFhoRlz\",\n            \"status\": \"fresh\",\n            \"updated_at\": \"2026-07-20T17:48:02Z\"\n        }\n    ],\n    \"queued\": 1,\n    \"refunded\": 0,\n    \"counts\": {\n        \"processing\": 1,\n        \"succeeded\": 0,\n        \"failed\": 0\n    },\n    \"complete\": false,\n    \"quota\": {\n        \"limit\": 1000,\n        \"used\": 43,\n        \"remaining\": 957,\n        \"reset_seconds\": 39132\n    }\n}"
                  }
                },
                "schema": {
                  "type": "object",
                  "properties": {
                    "items": {
                      "type": "array",
                      "description": "Per-item state for every requested ID.",
                      "items": {
                        "type": "object",
                        "properties": {
                          "availability_id": {
                            "type": "string",
                            "example": "2v37fWFcRCmlct2SFweD9Np5cVH"
                          },
                          "status": {
                            "type": "string",
                            "description": "Current state of this item: `queued` (queued by this call, one credit charged), `processing` (still being refreshed), `succeeded` (the data was refreshed), `failed` (the refresh did not complete; its credit was refunded, and the item can be re-queued after a short cooldown), `fresh` (updated within the last 3 hours, nothing to do), `skipped_outage` (the mileage program currently has an outage), `not_refreshable` (this program does not support refreshing), `not_found` (unknown ID), or `insufficient_quota` (stale, but beyond your remaining daily quota; not queued or charged, and can be re-submitted once quota frees up or resets). Only `queued` costs a credit.",
                            "example": "queued"
                          },
                          "updated_at": {
                            "type": "string",
                            "description": "The availability's current updated_at, when known (RFC 3339).",
                            "example": "2026-07-20T14:02:11Z"
                          }
                        }
                      }
                    },
                    "queued": {
                      "type": "integer",
                      "description": "Items queued (and credits charged) by this call.",
                      "example": 1
                    },
                    "refunded": {
                      "type": "integer",
                      "description": "Credits refunded by this call for newly detected failures.",
                      "example": 0
                    },
                    "counts": {
                      "type": "object",
                      "properties": {
                        "processing": {
                          "type": "integer",
                          "description": "Items queued or in flight (includes items just queued).",
                          "example": 1
                        },
                        "succeeded": {
                          "type": "integer",
                          "description": "Items whose data was updated.",
                          "example": 0
                        },
                        "failed": {
                          "type": "integer",
                          "description": "Items whose refresh did not complete.",
                          "example": 0
                        }
                      }
                    },
                    "complete": {
                      "type": "boolean",
                      "description": "True once no items are still processing; stop polling.",
                      "example": false
                    },
                    "quota": {
                      "type": "object",
                      "description": "Your daily API quota after this request. Refresh charges and refunds share the same pool as regular API calls.",
                      "properties": {
                        "limit": {
                          "type": "integer",
                          "description": "Total API calls allowed per UTC day.",
                          "example": 1000
                        },
                        "used": {
                          "type": "integer",
                          "description": "Calls consumed so far today, including refresh credits.",
                          "example": 43
                        },
                        "remaining": {
                          "type": "integer",
                          "description": "Calls left today.",
                          "example": 957
                        },
                        "reset_seconds": {
                          "type": "integer",
                          "description": "Seconds until the quota resets at UTC midnight.",
                          "example": 39132
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "400",
            "content": {
              "application/json": {
                "examples": {
                  "Result": {
                    "value": "{\n    \"error\": true,\n    \"code\": \"too_many_items\",\n    \"message\": \"availability_ids is limited to 250 IDs per request.\"\n}"
                  }
                },
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "boolean",
                      "example": true
                    },
                    "code": {
                      "type": "string",
                      "description": "One of `invalid_body` (body is not valid JSON), `no_availability_ids` (empty after de-duplication), or `too_many_items` (more than 250 IDs).",
                      "example": "too_many_items"
                    },
                    "message": {
                      "type": "string",
                      "description": "Human-readable explanation.",
                      "example": "availability_ids is limited to 250 IDs per request."
                    }
                  }
                }
              }
            }
          },
          "403": {
            "description": "403",
            "content": {
              "application/json": {
                "examples": {
                  "Result": {
                    "value": "{\n    \"error\": true,\n    \"code\": \"pro_key_required\",\n    \"message\": \"Cache refresh requires a Pro user API key or OAuth token.\"\n}"
                  }
                },
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "boolean",
                      "example": true
                    },
                    "code": {
                      "type": "string",
                      "description": "Always `pro_key_required`: the credentials are not a Pro user API key or OAuth token (e.g. a commercial partner key).",
                      "example": "pro_key_required"
                    },
                    "message": {
                      "type": "string",
                      "description": "Human-readable explanation.",
                      "example": "Cache refresh requires a Pro user API key or OAuth token."
                    }
                  }
                }
              }
            }
          },
          "429": {
            "description": "429",
            "content": {
              "application/json": {
                "examples": {
                  "Result": {
                    "value": "{\n    \"error\": true,\n    \"code\": \"rate_limit_exceeded\",\n    \"message\": \"Too many refresh requests; slow down polling and try again later.\"\n}"
                  }
                },
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "boolean",
                      "example": true
                    },
                    "code": {
                      "type": "string",
                      "description": "`rate_limit_exceeded` (hourly request cap hit; slow down polling). Running out of daily quota is not an error: stale items beyond your remaining quota simply report an `insufficient_quota` item status in the normal 200 response.",
                      "example": "rate_limit_exceeded"
                    },
                    "message": {
                      "type": "string",
                      "description": "Human-readable explanation.",
                      "example": "Too many refresh requests; slow down polling and try again later."
                    }
                  }
                }
              }
            }
          }
        }
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