"""HTTP response mapping for file tools."""

from __future__ import annotations

from flask import jsonify

from ..domain.errors import FileToolError


def success_response(payload: dict, status: int = 200):
    return jsonify(payload), status


def error_response(error: FileToolError, request_id: str):
    return (
        jsonify(
            {
                "success": False,
                "error": {
                    "code": error.code,
                    "message": error.message,
                    "requestId": request_id,
                },
            }
        ),
        error.status_code,
    )


def unexpected_error_response(request_id: str):
    return (
        jsonify(
            {
                "success": False,
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "Something went wrong while processing the file.",
                    "requestId": request_id,
                },
            }
        ),
        500,
    )
