# API Documentation Template

## Endpoint Overview
- **Endpoint**: {{endpoint_url}}
- **Method**: {{http_method}}
- **Version**: {{api_version}}
- **Authentication**: {{auth_method}}

## Description
{{endpoint_description}}

## Request

### Headers
| Header | Value | Required |
|--------|-------|----------|
| {{header_name_1}} | {{header_value_1}} | {{required_1}} |
| {{header_name_2}} | {{header_value_2}} | {{required_2}} |

### Query Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| {{param_1}} | {{type_1}} | {{required_1}} | {{desc_1}} |
| {{param_2}} | {{type_2}} | {{required_2}} | {{desc_2}} |

### Request Body
```json
{{request_body_example}}
```

### Schema
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| {{field_1}} | {{field_type_1}} | {{required_1}} | {{field_desc_1}} |

## Response

### Success Response ({{status_code}})
```json
{{success_response_example}}
```

### Error Responses
| Status Code | Description | Retryable |
|-------------|-------------|-----------|
| {{error_code_1}} | {{error_desc_1}} | {{retryable_1}} |
| {{error_code_2}} | {{error_desc_2}} | {{retryable_2}} |

## Rate Limiting
{{rate_limiting_info}}

## Code Examples

### cURL
```bash
{{curl_example}}
```

### Python
```python
{{python_example}}
```

### JavaScript
```javascript
{{javascript_example}}
```

## Changelog
| Version | Date | Change |
|---------|------|--------|
| {{version_num}} | {{date}} | {{change_desc}} |
