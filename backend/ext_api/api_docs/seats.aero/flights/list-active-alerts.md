---
updatedAt: 2026-09-09T06:48:26.000Z
agentTools:
  projectIndex: https://developers.seats.aero/llms.txt
---

# List Active Alerts

Read the alerts belonging to the authenticated user.

<Callout icon="🚧" theme="warn">
  ### Commercial Users

  The List Active Alerts API cannot be used with commercial partner keys. It requires a personal Pro API key or a user's OAuth access token.
</Callout>

`GET /partnerapi/alerts` returns all non-expired alerts for the user identified by the API credential.

## Authentication

Use either a personal Pro API key or an OAuth access token from [Login with Seats.aero](/reference/overview). Both require an active Pro subscription and use the `Partner-Authorization` header:

```shell
curl --request GET \
  --url https://seats.aero/partnerapi/alerts \
  --header 'Partner-Authorization: pro_YOUR_API_KEY'
```

For OAuth, use the existing `openid` scope and include `Bearer` in the same header:

```shell
curl --request GET \
  --url https://seats.aero/partnerapi/alerts \
  --header 'Partner-Authorization: Bearer seats:ota:YOUR_ACCESS_TOKEN'
```

Commercial partner keys do not identify a user and receive HTTP 403. A browser login alone does not authenticate this endpoint. The API credential determines the account even when a different browser session is present. Legacy award alerts without a user ID are included when their delivery email matches the authenticated account; alerts explicitly owned by another account are excluded.

Each request uses one call from the user's shared daily API quota, including requests made through OAuth apps. Standard Partner API rate-limit headers apply.

## Response

The response is an object containing a lowercase `data` array. Alert fields use native Go capitalization, such as `ID`, `CreatedAt`, and `OriginAirport`, matching the Partner API availability and trip objects. It returns all matching alerts without pagination, ordered by `CreatedAt` descending, then `ID` and `Type` ascending. An account with no active alerts receives `{"data":[]}`.

| `Type`           | Alert                                                      |
| :--------------- | :--------------------------------------------------------- |
| `award`          | Award availability, one item per route and mileage program |
| `united_upgrade` | United upgrade availability                                |
| `cathay`         | Cathay calendar availability                               |
| `seat`           | Seat map availability                                      |
| `fare`           | Fare class availability                                    |

Active means the stored alert has not expired. Paused award alerts are included with `Paused: true`; they remain configured but do not currently send notifications. Expiration is maintained by the existing alert workers, so this read does not remove past-date alerts awaiting worker processing. Continuous award alerts remain visible until expired.

Each item includes its ID, type, creation time, airports, notification channel, date bounds, `AnyDate`, and `Paused`. Type-specific filters appear when set; unset optional fields are omitted. `DateFrom` and `DateTo` are inclusive departure dates in `YYYY-MM-DD` format. Both are empty strings when `AnyDate` is true. For a single date they are equal.

Award items sharing a `GroupID` were created together. `Cabins` uses `economy`, `premium`, `business`, or `first`; Delta Comfort+ seat alerts use `comfort_plus`. `MinCabinPct` is the required share of journey distance in the selected cabin; 100 allows no mixed cabin segments. `MaxFees` is in USD cents. Time filters use local hours and minutes with the keys `startHour`, `startMinute`, `endHour`, and `endMinute`.

Delivery email addresses, phone numbers, account records, and internal match history are excluded.

## Errors

Errors use plain-text bodies, not JSON objects. Inspect the HTTP status and body together.

| Status | Body                            | Meaning                                                                  |
| :----- | :------------------------------ | :----------------------------------------------------------------------- |
| 401    | `missing_partner_key`           | No Partner API credential was supplied.                                  |
| 401    | `bad_partner_key`               | The API key is invalid or does not allow this route.                     |
| 401    | `bad_partner_token`             | The OAuth token is invalid, expired, or revoked, or its app is disabled. |
| 401    | `invalid_scope`                 | The OAuth token does not have the supported `openid` scope.              |
| 401    | `user_subscription_expired`     | The user no longer has an active Pro subscription.                       |
| 403    | `user_api_credentials_required` | An authenticated partner key does not identify a user.                   |
| 429    | `user_rate_limit_exceeded`      | The user's shared daily API quota has been exceeded.                     |
| 500    | `error_loading_alerts`          | An alert query failed; no partial list is returned.                      |

The 403 and 500 bodies end with a newline.

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
    "/alerts": {
      "get": {
        "summary": "List Active Alerts",
        "description": "Read-only list of the authenticated user's non-expired alerts across all five alert types. Requires a personal Pro API key or an OAuth access token with the existing openid scope in Partner-Authorization. Commercial partner keys are not supported. Paused alerts are included with Paused=true. Returns all items without pagination, newest first, with ties sorted by ID then Type. Each request uses one call from the shared daily Pro API quota.",
        "operationId": "list-active-alerts",
        "responses": {
          "200": {
            "description": "All non-expired alerts for the authenticated user. An empty account returns {\"data\":[]}.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "data"
                  ],
                  "properties": {
                    "data": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "required": [
                          "ID",
                          "Type",
                          "CreatedAt",
                          "OriginAirport",
                          "DestinationAirport",
                          "Channel",
                          "DateFrom",
                          "DateTo",
                          "AnyDate",
                          "Paused"
                        ],
                        "properties": {
                          "ID": {
                            "description": "Unique alert ID. Each route/program alert is a separate item, even when created as part of a group.",
                            "type": "string"
                          },
                          "Type": {
                            "description": "Alert type: award availability, United upgrade, Cathay calendar, seat map, or fare class.",
                            "type": "string",
                            "enum": [
                              "award",
                              "united_upgrade",
                              "cathay",
                              "seat",
                              "fare"
                            ]
                          },
                          "CreatedAt": {
                            "description": "Time the alert was created, in RFC 3339 format.",
                            "type": "string",
                            "format": "date-time"
                          },
                          "OriginAirport": {
                            "description": "Departure airport IATA code.",
                            "type": "string"
                          },
                          "DestinationAirport": {
                            "description": "Arrival airport IATA code.",
                            "type": "string"
                          },
                          "Channel": {
                            "description": "Notification channel. Delivery addresses and phone numbers are never returned. An empty value indicates a legacy alert without a stored channel.",
                            "type": "string",
                            "enum": [
                              "email",
                              "sms",
                              ""
                            ]
                          },
                          "DateFrom": {
                            "description": "First departure date (YYYY-MM-DD). Empty when AnyDate is true.",
                            "type": "string"
                          },
                          "DateTo": {
                            "description": "Last departure date, inclusive (YYYY-MM-DD). Equals DateFrom for a single date; empty when AnyDate is true.",
                            "type": "string"
                          },
                          "AnyDate": {
                            "description": "Whether an award alert accepts any tracked departure date.",
                            "type": "boolean"
                          },
                          "Paused": {
                            "description": "Whether the award alert is paused. Paused alerts are non-expired and remain in the list, but do not currently send notifications. False for other alert types.",
                            "type": "boolean"
                          },
                          "Source": {
                            "description": "Mileage program identifier for award, united_upgrade, and cathay alerts. Omitted when no specific program is stored.",
                            "type": "string"
                          },
                          "Nickname": {
                            "description": "User-provided award alert nickname, when set.",
                            "type": "string"
                          },
                          "GroupID": {
                            "description": "Group ID for award alerts created together. Omitted for ungrouped alerts.",
                            "type": "string"
                          },
                          "Cabins": {
                            "description": "Selected cabins for award, cathay, or seat alerts. Premium economy is represented as premium. Delta Comfort+ seat alerts use comfort_plus.",
                            "type": "array",
                            "items": {
                              "type": "string",
                              "enum": [
                                "economy",
                                "premium",
                                "business",
                                "first",
                                "comfort_plus"
                              ]
                            }
                          },
                          "DirectOnly": {
                            "description": "Award alerts: match only nonstop flights. Defaults to false when omitted.",
                            "type": "boolean"
                          },
                          "Carrier": {
                            "description": "Award alerts: comma-separated carrier filter. Seat/fare alerts: flight marketing carrier code.",
                            "type": "string"
                          },
                          "CarriersExcluded": {
                            "description": "Award alerts: Carrier lists exclusions instead of inclusions. Defaults to false when omitted.",
                            "type": "boolean"
                          },
                          "FilteredTrips": {
                            "description": "Award alerts: use trip-level filters instead of the default aggregate availability filters. Defaults to false when omitted.",
                            "type": "boolean"
                          },
                          "MinCabinPct": {
                            "description": "Award alerts: minimum percentage of journey distance in the selected cabin. 100 means no mixed cabin tolerance.",
                            "type": "integer",
                            "minimum": 0,
                            "maximum": 100
                          },
                          "MinSeats": {
                            "description": "Minimum matching seats for award, united_upgrade, or fare alerts. For fare alerts, LessThan reverses the comparison.",
                            "type": "integer",
                            "minimum": 0
                          },
                          "MaxPoints": {
                            "description": "Award alerts: maximum points cost. Omitted when no maximum is set.",
                            "type": "integer",
                            "minimum": 0
                          },
                          "MaxFees": {
                            "description": "Award alerts: maximum fees in USD cents, such as 12500 for USD 125. Omitted when no maximum is set.",
                            "type": "integer",
                            "minimum": 0
                          },
                          "MaxStops": {
                            "description": "Award alerts: maximum stops when set. Use DirectOnly to identify nonstop-only alerts.",
                            "type": "integer",
                            "minimum": 0
                          },
                          "FareClass": {
                            "description": "Fare or upgrade booking class filter for award, united_upgrade, or fare alerts.",
                            "type": "string"
                          },
                          "FlightNumber": {
                            "description": "Flight number filter as a string. United upgrades may include the carrier prefix; seat/fare values preserve leading zeros.",
                            "type": "string"
                          },
                          "Continuous": {
                            "description": "Award alerts: continue monitoring after a match. Defaults to false when omitted.",
                            "type": "boolean"
                          },
                          "DepartureTimeRange": {
                            "description": "Award alerts: local departure time filter, when set. Hour 24 represents end of day.",
                            "type": "object",
                            "required": [
                              "startHour",
                              "startMinute",
                              "endHour",
                              "endMinute"
                            ],
                            "properties": {
                              "startHour": {
                                "type": "integer",
                                "minimum": 0,
                                "maximum": 24
                              },
                              "startMinute": {
                                "type": "integer",
                                "minimum": 0,
                                "maximum": 59
                              },
                              "endHour": {
                                "type": "integer",
                                "minimum": 0,
                                "maximum": 24
                              },
                              "endMinute": {
                                "type": "integer",
                                "minimum": 0,
                                "maximum": 59
                              }
                            }
                          },
                          "ArrivalTimeRange": {
                            "description": "Award alerts: local arrival time filter, when set. Hour 24 represents end of day.",
                            "type": "object",
                            "required": [
                              "startHour",
                              "startMinute",
                              "endHour",
                              "endMinute"
                            ],
                            "properties": {
                              "startHour": {
                                "type": "integer",
                                "minimum": 0,
                                "maximum": 24
                              },
                              "startMinute": {
                                "type": "integer",
                                "minimum": 0,
                                "maximum": 59
                              },
                              "endHour": {
                                "type": "integer",
                                "minimum": 0,
                                "maximum": 24
                              },
                              "endMinute": {
                                "type": "integer",
                                "minimum": 0,
                                "maximum": 59
                              }
                            }
                          },
                          "Seats": {
                            "description": "Seat alerts: specific seat labels to monitor, when set.",
                            "type": "array",
                            "items": {
                              "type": "string"
                            }
                          },
                          "PreferWindow": {
                            "description": "Seat alerts: monitor window seats. Defaults to false when omitted.",
                            "type": "boolean"
                          },
                          "PreferAisle": {
                            "description": "Seat alerts: monitor aisle seats. Defaults to false when omitted.",
                            "type": "boolean"
                          },
                          "AlertOnBlocked": {
                            "description": "Seat alerts: also match blocked seats. Defaults to false when omitted.",
                            "type": "boolean"
                          },
                          "LessThan": {
                            "description": "Fare alerts: notify when available seats are less than MinSeats. Otherwise match at least MinSeats.",
                            "type": "boolean"
                          },
                          "SearchOriginAirport": {
                            "description": "Fare alerts: origin of the full itinerary being searched, when set.",
                            "type": "string"
                          },
                          "SearchDestinationAirport": {
                            "description": "Fare alerts: destination of the full itinerary being searched, when set.",
                            "type": "string"
                          },
                          "SearchFlights": {
                            "description": "Fare alerts: comma-separated flight identifiers for the searched itinerary, when set.",
                            "type": "string"
                          },
                          "Codeshares": {
                            "description": "Fare alerts: include codeshares in the search. Defaults to false when omitted.",
                            "type": "boolean"
                          }
                        }
                      }
                    }
                  }
                },
                "examples": {
                  "Alerts": {
                    "value": {
                      "data": [
                        {
                          "ID": "alert_example",
                          "Type": "award",
                          "CreatedAt": "2026-09-09T12:00:00Z",
                          "OriginAirport": "SFO",
                          "DestinationAirport": "LHR",
                          "Channel": "email",
                          "DateFrom": "2026-12-01",
                          "DateTo": "2026-12-07",
                          "AnyDate": false,
                          "Paused": false,
                          "Source": "aeroplan",
                          "Nickname": "London trip",
                          "Cabins": [
                            "business"
                          ],
                          "MinCabinPct": 100,
                          "MinSeats": 2,
                          "MaxPoints": 80000
                        }
                      ]
                    }
                  },
                  "Empty": {
                    "value": {
                      "data": []
                    }
                  }
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid credentials, expired/revoked OAuth token, disabled OAuth app, invalid scope, or expired Pro subscription. Uses the existing Partner API authentication errors.",
            "content": {
              "text/plain": {
                "schema": {
                  "type": "string",
                  "enum": [
                    "missing_partner_key",
                    "bad_partner_key",
                    "bad_partner_token",
                    "invalid_scope",
                    "user_subscription_expired"
                  ]
                },
                "examples": {
                  "Missing credential": {
                    "value": "missing_partner_key"
                  },
                  "Invalid key": {
                    "value": "bad_partner_key"
                  },
                  "Invalid token": {
                    "value": "bad_partner_token"
                  },
                  "Invalid scope": {
                    "value": "invalid_scope"
                  },
                  "Expired subscription": {
                    "value": "user_subscription_expired"
                  }
                }
              }
            }
          },
          "403": {
            "description": "user_api_credentials_required: a commercial partner key does not identify a user. Supply a personal Pro API key or a user OAuth access token.",
            "content": {
              "text/plain": {
                "schema": {
                  "type": "string",
                  "enum": [
                    "user_api_credentials_required\n"
                  ]
                },
                "examples": {
                  "User credential required": {
                    "value": "user_api_credentials_required\n"
                  }
                }
              }
            }
          },
          "429": {
            "description": "user_rate_limit_exceeded: the shared daily Pro API quota has been exceeded.",
            "content": {
              "text/plain": {
                "schema": {
                  "type": "string",
                  "enum": [
                    "user_rate_limit_exceeded"
                  ]
                },
                "examples": {
                  "Quota exceeded": {
                    "value": "user_rate_limit_exceeded"
                  }
                }
              }
            }
          },
          "500": {
            "description": "error_loading_alerts: alerts could not be loaded. No partial list is returned.",
            "content": {
              "text/plain": {
                "schema": {
                  "type": "string",
                  "enum": [
                    "error_loading_alerts\n"
                  ]
                },
                "examples": {
                  "Load failed": {
                    "value": "error_loading_alerts\n"
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