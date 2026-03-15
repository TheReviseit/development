import os
import json
import logging
from typing import List, Dict, Any, Optional
import gspread # pyre-ignore[21]
from google.oauth2.service_account import Credentials # pyre-ignore[21]
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Constants
SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
]

def _get_client():
    creds_json = os.getenv("GOOGLE_SHEETS_CREDENTIALS")
    if not creds_json:
        raise ValueError("Google Sheets credentials not configured.")
    
    creds_dict = json.loads(creds_json)
    creds = Credentials.from_service_account_info(creds_dict, scopes=SCOPES)
    client = gspread.authorize(creds)
    return client

def extract_sheet_id(url: str) -> Optional[str]:
    """Extracts the document ID from a Google Sheets URL."""
    try:
        parsed = urlparse(url)
        path_parts = parsed.path.split('/')
        if 'd' in path_parts:
            # The ID is usually the part right after '/d/'
            idx = path_parts.index('d')
            if idx + 1 < len(path_parts):
                return path_parts[idx + 1]
    except Exception:
        pass
    return None

def test_sheet_connection(url: str) -> bool:
    """Tests if the service account has access to the sheet."""
    try:
        sheet_id = extract_sheet_id(url)
        if not sheet_id:
            logger.error(f"Invalid Google Sheet URL format: {url}")
            return False
            
        client = _get_client()
        # Try to open the sheet by key
        client.open_by_key(sheet_id)
        return True
    except Exception as e:
        logger.error(f"Failed to connect to Google Sheet {url}: {e}")
        return False

def init_sheet_headers(url: str, headers: List[str]) -> bool:
    """Sets the headers on the first row if the sheet is empty."""
    try:
        sheet_id = extract_sheet_id(url)
        if not sheet_id:
            return False
            
        client = _get_client()
        spreadsheet = client.open_by_key(sheet_id)
        worksheet = spreadsheet.sheet1
        
        # Check if first row is empty
        first_row = worksheet.row_values(1)
        if not first_row:
            # Sheet is empty, write headers
            worksheet.append_row(headers)
            # Format header row to be bold
            worksheet.format('A1:Z1', {'textFormat': {'bold': True}})
            return True
        return True # Headers already exist or sheet not empty
    except Exception as e:
        logger.error(f"Failed to init headers for {url}: {e}")
        return False

def append_row(url: str, row_values: List[Any]) -> bool:
    """Appends a single row to the first worksheet."""
    try:
        sheet_id = extract_sheet_id(url)
        if not sheet_id:
            return False
            
        client = _get_client()
        spreadsheet = client.open_by_key(sheet_id)
        worksheet = spreadsheet.sheet1
        # Use userEntered to apply smart formatting (dates, numbers)
        worksheet.append_row([str(v) if v is not None else "" for v in row_values], value_input_option='USER_ENTERED')
        return True
    except Exception as e:
        logger.error(f"Failed to append row to Google Sheet. ID: {extract_sheet_id(url)}. Error: {e}")
        return False
