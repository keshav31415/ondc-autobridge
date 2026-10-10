# ONDC Beckn Schema Rules (Grocery / Retail)

When generating the Express microservice for the ONDC BPP (Seller Node), you MUST map the provided merchant CSV inventory to this exact JSON schema format.

## Mandatory Endpoints
You must implement two endpoints:
1. `POST /search`
2. `POST /select`

## Catalog Schema (`/search` response)
When the ONDC Gateway sends a `/search` request, your BPP must respond with a catalog JSON matching this exact structure:

```json
{
  "context": {
    "domain": "nic2004:52110",
    "country": "IND",
    "city": "std:080",
    "action": "on_search",
    "bpp_id": "sharma-grocery.bpp.ondc.org",
    "bpp_uri": "https://sharma-grocery.bpp.ondc.org"
  },
  "message": {
    "catalog": {
      "bpp/descriptor": {
        "name": "Sharma Grocery"
      },
      "bpp/providers": [
        {
          "id": "P1",
          "descriptor": {
            "name": "Sharma Grocery Store"
          },
          "fssai_license_no": "12345678901234", // CRITICAL: This is mandatory for Grocery!
          "items": [
            // Map the CSV items here
            {
              "id": "item_1",
              "descriptor": {
                "name": "Item_Name_From_CSV",
                "code": "Category_From_CSV"
              },
              "price": {
                "currency": "INR",
                "value": "Cost_Price_From_CSV"
              },
              "quantity": {
                "available": {
                  "count": "Qty_Left_From_CSV"
                }
              },
              "tags": {
                "veg": true_or_false_based_on_csv
              }
            }
          ]
        }
      ]
    }
  }
}
```

## Security / Authentication
ALL endpoints MUST verify the Ed25519 cryptographic signature in the `Authorization` header.
If the signature is missing or invalid, return `401 Unauthorized`.
Use standard Node.js crypto or the `ondc-crypto-sdk` logic for verification.
