from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import requests
from io import StringIO
import re
import os
from pydantic import BaseModel, Field
from enum import Enum

# --------------------------------------------------
# Pydantic Models
# --------------------------------------------------

class InputType(str, Enum):
    TEXT = "text"
    NUMBER = "number"
    EMAIL = "email"
    DATE = "date"
    SELECT = "select"
    TEXTAREA = "textarea"

class SchemaField(BaseModel):
    field_name: str
    label: str
    input_type: InputType
    required: bool = False
    options: list = []
    validation: str = ""

class UpdateSchemaRequest(BaseModel):
    schema: list

class GoogleSheetRequest(BaseModel):
    url: str

class GenerateFlowRequest(BaseModel):
    schema: list
    flow_id: str = "generated_form"

# --------------------------------------------------
# FastAPI App Setup
# --------------------------------------------------

app = FastAPI(title="Universal Form Schema Generator API", version="1.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
UPLOAD_FOLDER = "uploads"
ALLOWED_EXTENSIONS = {"csv"}
MAX_FILE_SIZE = 16 * 1024 * 1024  # 16MB

# Create uploads directory if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# --------------------------------------------------
# Helper Functions
# --------------------------------------------------

def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def download_google_sheet_as_csv(sheet_url: str) -> pd.DataFrame:
    match = re.search(r"/d/([a-zA-Z0-9-_]+)", sheet_url)
    if not match:
        raise ValueError("Invalid Google Sheet URL")

    sheet_id = match.group(1)
    csv_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv"
    response = requests.get(csv_url)

    if response.status_code != 200:
        raise ValueError("Unable to download Google Sheet")

    return pd.read_csv(StringIO(response.text))

def infer_schema_from_dataframe(df: pd.DataFrame) -> list:
    schema = []

    for col in df.columns:
        series = df[col].dropna()

        if pd.api.types.is_numeric_dtype(series):
            input_type = "number"
        elif pd.api.types.is_datetime64_any_dtype(series):
            input_type = "date"
        elif series.nunique() <= 20:
            input_type = "select"
        else:
            input_type = "text"

        options = sorted(series.unique().tolist()) if input_type == "select" else []

        schema.append({
            "field_name": col,
            "label": col.replace("_", " ").title(),
            "input_type": input_type,
            "required": False,
            "options": options,
            "validation": ""
        })

    return schema

def build_flow_from_schema(schema: list, flow_id: str = "generated_form") -> dict:
    steps = []

    for index, field in enumerate(schema):
        # Create step with specific key order
        step = {
            "step": index + 1,
            "field_name": field["field_name"],
            "question": field["label"],
            "input_type": field["input_type"],
            "required": field.get("required", False),
            "options": field.get("options", []),
            "validation": field.get("validation", "")
        }
        steps.append(step)

    # Create flow with specific key order
    flow = {
        "flow_id": flow_id,
        "total_steps": len(steps),
        "steps": steps,
        "completion_message": "Thank you. Your response has been recorded."
    }
    
    return flow

def clean_schema_fields(schema: list) -> list:
    """Validate and clean schema fields"""
    for field in schema:
        if "input_type" not in field:
            field["input_type"] = "text"
        if "options" not in field:
            field["options"] = []
        if "required" not in field:
            field["required"] = False
        if "validation" not in field:
            field["validation"] = ""
    return schema

# --------------------------------------------------
# API Routes
# --------------------------------------------------

@app.get("/")
async def root():
    return {"message": "Universal Form Schema Generator API", "status": "running"}

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "Universal Form Schema Generator API"}

@app.post("/api/upload/csv")
async def upload_csv(file: UploadFile = File(...)):
    # Check if file is provided
    if not file:
        raise HTTPException(status_code=400, detail="No file provided")
    
    # Check file extension
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Invalid file type. Only CSV files are allowed.")
    
    try:
        # Read file content directly into memory
        contents = await file.read()
        
        # Use StringIO to create a file-like object from the contents
        import io
        import pandas as pd
        
        # Decode bytes to string and create DataFrame
        csv_string = contents.decode('utf-8')
        df = pd.read_csv(io.StringIO(csv_string))
        
        # Process the dataframe to create schema
        schema = []
        for col in df.columns:
            series = df[col].dropna()
            
            if pd.api.types.is_numeric_dtype(series):
                input_type = "number"
            elif pd.api.types.is_datetime64_any_dtype(series):
                input_type = "date"
            elif series.nunique() <= 20:
                input_type = "select"
            else:
                input_type = "text"
            
            options = sorted(series.unique().tolist()) if input_type == "select" else []
            
            schema.append({
                "field_name": col,
                "label": col.replace("_", " ").title(),
                "input_type": input_type,
                "required": False,
                "options": options,
                "validation": ""
            })
        
        return JSONResponse(content={
            "success": True,
            "schema": schema,
            "filename": file.filename
        })
    except Exception as e:
        print(f"Error processing CSV: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/process/gsheet")
async def process_gsheet(request: GoogleSheetRequest):
    if not request.url:
        raise HTTPException(status_code=400, detail="No URL provided")
    
    try:
        df = download_google_sheet_as_csv(request.url)
        schema = infer_schema_from_dataframe(df)
        
        return JSONResponse(content={
            "success": True,
            "schema": schema
        })
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/update/schema")
async def update_schema(request: UpdateSchemaRequest):
    if not request.schema:
        raise HTTPException(status_code=400, detail="No schema provided")
    
    try:
        # Clean and validate schema
        cleaned_schema = clean_schema_fields(request.schema)
        
        return JSONResponse(content={
            "success": True,
            "schema": cleaned_schema
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate/flow")
async def generate_flow(request: GenerateFlowRequest):
    if not request.schema:
        raise HTTPException(status_code=400, detail="No schema provided")
    
    try:
        flow = build_flow_from_schema(request.schema, request.flow_id)
        
        return JSONResponse(content={
            "success": True,
            "flow": flow
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Helper function for secure filename
def secure_filename(filename: str) -> str:
    """Secure filename helper"""
    filename = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
    return filename

# --------------------------------------------------
# Run with: uvicorn main:app --reload --port 5000
# --------------------------------------------------