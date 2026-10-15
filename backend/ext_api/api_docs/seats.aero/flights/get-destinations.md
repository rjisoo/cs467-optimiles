---
updatedAt: 2026-06-17T05:55:28.000Z
agentTools:
  projectIndex: https://developers.seats.aero/llms.txt
---

# Get Destinations

Returns the airports reachable from (or to) a single airport, along with the cheapest raw nonstop mileage price per cabin, aggregated across every source. Only direct/nonstop itineraries are considered; connecting prices are excluded. Supply exactly one of `origin_airport` or `destination_airport`. A cabin with no nonstop availability is returned as `null` (never `0`).

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
    "/destinations": {
      "get": {
        "summary": "Get Destinations",
        "description": "Returns the airports reachable from (or to) a single airport, along with the cheapest raw nonstop mileage price per cabin, aggregated across every source. Only direct/nonstop itineraries are considered; connecting prices are excluded. Supply exactly one of `origin_airport` or `destination_airport`. A cabin with no nonstop availability is returned as `null` (never `0`).",
        "operationId": "get-destinations",
        "parameters": [
          {
            "name": "origin_airport",
            "in": "query",
            "required": false,
            "description": "Origin IATA code (3 letters). When supplied, the response lists reachable destinations and their cheapest nonstop price. Provide either this or destination_airport, not both. Metro/alias codes are expanded automatically.",
            "schema": {
              "type": "string",
              "example": "SFO"
            }
          },
          {
            "name": "destination_airport",
            "in": "query",
            "required": false,
            "description": "Destination IATA code (3 letters). When supplied, the response lists origin airports from which this airport is reachable nonstop, and their cheapest price. Provide either this or origin_airport, not both. Metro/alias codes are expanded automatically.",
            "schema": {
              "type": "string",
              "example": "JFK"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "200",
            "content": {
              "application/json": {
                "examples": {
                  "Result": {
                    "value": "{\n    \"origin_airport\": \"SFO\",\n    \"destinations\": [\n        {\n            \"airport\": \"JFK\",\n            \"economy\": 18000,\n            \"premium\": null,\n            \"business\": 45000,\n            \"first\": null\n        },\n        {\n            \"airport\": \"LHR\",\n            \"economy\": 30000,\n            \"premium\": 45000,\n            \"business\": 75000,\n            \"first\": 110000\n        }\n    ],\n    \"success\": true\n}"
                  }
                },
                "schema": {
                  "type": "object",
                  "properties": {
                    "origin_airport": {
                      "type": "string",
                      "description": "Echoes the requested origin. Present only when origin_airport was supplied.",
                      "example": "SFO"
                    },
                    "destination_airport": {
                      "type": "string",
                      "description": "Echoes the requested destination. Present only when destination_airport was supplied.",
                      "example": "JFK"
                    },
                    "destinations": {
                      "type": "array",
                      "description": "Reachable airports on the other end. Empty when the airport has no known nonstop routes.",
                      "items": {
                        "type": "object",
                        "properties": {
                          "airport": {
                            "type": "string",
                            "description": "The IATA code on the other end of the route.",
                            "example": "JFK"
                          },
                          "economy": {
                            "type": "integer",
                            "description": "Cheapest raw nonstop economy mileage price across all sources, or null if no nonstop economy availability.",
                            "example": 18000
                          },
                          "premium": {
                            "type": "integer",
                            "description": "Cheapest raw nonstop premium economy mileage price across all sources, or null.",
                            "example": 45000
                          },
                          "business": {
                            "type": "integer",
                            "description": "Cheapest raw nonstop business mileage price across all sources, or null.",
                            "example": 45000
                          },
                          "first": {
                            "type": "integer",
                            "description": "Cheapest raw nonstop first class mileage price across all sources, or null.",
                            "example": 110000
                          }
                        }
                      }
                    },
                    "success": {
                      "type": "boolean",
                      "example": true
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
                    "value": "{\n    \"destinations\": [],\n    \"success\": false,\n    \"error\": \"provide only one of origin_airport or destination_airport\"\n}"
                  }
                },
                "schema": {
                  "type": "object",
                  "properties": {
                    "destinations": {
                      "type": "array",
                      "items": {
                        "type": "object"
                      }
                    },
                    "success": {
                      "type": "boolean",
                      "example": false
                    },
                    "error": {
                      "type": "string",
                      "example": "provide only one of origin_airport or destination_airport"
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