from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import requests
from io import StringIO
import re
import os
from pydantic import BaseModel, Field
from enum import Enum
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime, UTC
from dotenv import load_dotenv
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

# ================= LOAD ENV =================


load_dotenv()

ACCESS_TOKEN = os.getenv("ACCESS_TOKEN")
VERIFY_TOKEN = "mytoken"
FIREBASE_CREDENTIALS = os.getenv("FIREBASE_CREDENTIALS")
WHATSAPP_URL = os.getenv("URL")

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

# ================= FIREBASE INIT =================

cred = credentials.Certificate(FIREBASE_CREDENTIALS)
firebase_admin.initialize_app(cred)
db = firestore.client()

# ================= RUNTIME CONFIG =================

runtime_config = {
    "flow": None,
    "firebase_uid": None,
    "database_name": None
}

# ================= IN-MEMORY USER SESSIONS =================

user_sessions = {}


def get_session(phone):
    if phone not in user_sessions:
        user_sessions[phone] = {
            "current_step": 0,
            "responses": {},
            "completed": False,
            "template_sent": False
        }
    return user_sessions[phone]

# ================= FETCH CONTACTS =================


def fetch_all_contacts(firebase_uid, database_name):
    try:
        contacts_ref = (
            db.collection("users")
              .document(firebase_uid)
              .collection("databases")
              .document(database_name)
              .collection("contacts")
        )

        docs = contacts_ref.stream()
        phone_list = [doc.id for doc in docs]

        print("Fetched Contacts:", phone_list)
        return phone_list

    except Exception as e:
        print("Error fetching contacts:", str(e))
        return []

# ================= TEMPLATE LOGIC =================


def check_and_send_template(firebase_uid, database_name, phone):
    contact_ref = (
        db.collection("users")
          .document(firebase_uid)
          .collection("databases")
          .document(database_name)
          .collection("contacts")
          .document(phone)
    )

    contact_doc = contact_ref.get()

    if not contact_doc.exists:
        send_template(phone)
        contact_ref.set({
            "template_sent": True,
            "created_at": datetime.utcnow()
        })
        return True

    contact_data = contact_doc.to_dict()

    if not contact_data.get("template_sent"):
        send_template(phone)
        contact_ref.update({"template_sent": True})
        return True

    return False


def send_template(to):
    payload = {
    "messaging_product": "whatsapp",
    "recipient_type": "individual",
    "to": to,
    "type": "template",
    "template": {
        "name": "form_invitation_template",
        "language": {
        "code": "en_US"
        },
        "components": [
        {
            "type": "body",
            "parameters": [
            {
                "type": "text",
                "parameter_name": "first_name",
                "text": "Urmil"
            }
            ]
        }
        ]
    }
    }

    headers = {
        "Authorization": f"Bearer {ACCESS_TOKEN}",
        "Content-Type": "application/json"
    }

    response = requests.post(WHATSAPP_URL, json=payload, headers=headers)
    print("Template Status:", response.status_code)
    print(response.json())

# ================= SEND MESSAGE =================


def send_message(to, text):
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": text}
    }

    headers = {
        "Authorization": f"Bearer {ACCESS_TOKEN}",
        "Content-Type": "application/json"
    }

    response = requests.post(WHATSAPP_URL, json=payload, headers=headers)
    print("Message Status:", response.status_code)
    print(response.json())

# ================= FLOW HELPERS =================


def generate_question(step):
    question = step["question"]

    if step["input_type"] == "select" and step["options"]:
        options_text = " / ".join(step["options"])
        question = f"{question} ({options_text})"

    return question


def validate_input(user_input, step):
    if step["input_type"] == "number":
        return user_input.isdigit()

    if step["input_type"] == "select":
        return user_input.upper() in step["options"]

    return True

# ================= SAVE SUBMISSION =================


def save_to_firestore(firebase_uid, database_name, phone, data):
    try:
        submission_ref = (
            db.collection("users")
              .document(firebase_uid)
              .collection("databases")
              .document(database_name)
              .collection("submissions")
        )

        submission_ref.add({
            **data,
            "phone": phone,
            "created_at": datetime.now(UTC)
        })

        print("Saved successfully")

    except Exception as e:
        print("Firestore Error:", str(e))

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

        options = sorted(series.unique().tolist()
                         ) if input_type == "select" else []

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
        raise HTTPException(
            status_code=400, detail="Invalid file type. Only CSV files are allowed.")

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

            options = sorted(series.unique().tolist()
                             ) if input_type == "select" else []

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

# ================= WEBHOOK VERIFICATION =================


@app.get("/webhook")
async def verify_webhook(request: Request):
    params = request.query_params

    if params.get("hub.mode") == "subscribe" and params.get("hub.verify_token") == VERIFY_TOKEN:
        return PlainTextResponse(content=params.get("hub.challenge"))

    return PlainTextResponse(content="Forbidden", status_code=403)

# ================= RECEIVE MESSAGE =================


@app.post("/webhook")
async def receive_message(request: Request):

    if not runtime_config["flow"]:
        return {"status": "error", "message": "System not initialized"}

    flow = runtime_config["flow"]

    body = await request.json()

    try:
        message = body["entry"][0]["changes"][0]["value"]["messages"][0]
        sender = message["from"]
        user_text = message["text"]["body"].strip()
    except:
        return {"status": "ignored"}

    session = get_session(sender)

    if session["completed"]:
        send_message(sender, "You have already submitted the form.")
        return {"status": "already_completed"}

    # Start form
    if session["current_step"] == 0:
        session["current_step"] = 1
        first_question = generate_question(flow["steps"][0])
        send_message(sender, first_question)
        return {"status": "form_started"}

    # Continue form
    step_index = session["current_step"] - 1
    current_step_data = flow["steps"][step_index]

    if not validate_input(user_text, current_step_data):
        send_message(
            sender, f"Invalid input. Please enter {generate_question(current_step_data)}")
        return {"status": "validation_failed"}

    session["responses"][current_step_data["field_name"]] = user_text
    session["current_step"] += 1

    if session["current_step"] <= flow["total_steps"]:
        next_step = flow["steps"][session["current_step"] - 1]
        send_message(sender, generate_question(next_step))
    else:
        send_message(sender, flow["completion_message"])

        save_to_firestore(
            firebase_uid=runtime_config["firebase_uid"],
            database_name=runtime_config["database_name"],
            phone=sender,
            data=session["responses"]
        )

        session["completed"] = True

    return {"status": "success"}

# ================= INITIALIZE FROM API GATEWAY =================


@app.post("/initialize")
async def initialize_config(request: Request):
    body = await request.json()

    firebase_uid = body.get("firebase_uid")
    database_name = body.get("database_name")
    flow_data = body.get("flow")

    if not firebase_uid or not database_name or not flow_data:
        return {"status": "error", "message": "Missing required fields"}

    runtime_config["firebase_uid"] = firebase_uid
    runtime_config["database_name"] = database_name
    runtime_config["flow"] = flow_data

    print("System initialized successfully")

    # Send template to all contacts
    phone_list = fetch_all_contacts(firebase_uid, database_name)

    for phone_number in phone_list:
        check_and_send_template(firebase_uid, database_name, phone_number)
        get_session(phone_number)

    return {"status": "success", "message": "System initialized"}

# Helper function for secure filename


def secure_filename(filename: str) -> str:
    """Secure filename helper"""
    filename = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
    return filename
