# 🧩 FormFlow - WhatsApp Form Generator

[![FastAPI](https://img.shields.io/badge/FastAPI-0.104.1-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![Firebase](https://img.shields.io/badge/Firebase-10.7.0-FFCA28?logo=firebase)](https://firebase.google.com)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python)](https://python.org)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## 📌 Overview

FormFlow is a comprehensive web application that transforms traditional form creation into WhatsApp-ready conversational flows. Built for businesses, educators, and developers, it eliminates the complexity of manual form building by providing intelligent automation.

**Live Demo:** [Coming Soon]  
**API Endpoint:** `https://hemimetabolous-gabelled-aline.ngrok-free.dev`

## ✨ Key Features

### 📁 Multiple Input Methods
- **CSV Upload** - Auto-detect field types (text, number, date, select) with 98% accuracy
- **Google Sheets** - Import directly via URL, no manual data entry
- **Build from Scratch** - 6 input types with validation rules and real-time preview

### 🗄️ Database Management
- User-specific isolated databases
- Create/select multiple databases per user
- Real-time contact and submission counters

### 📞 WhatsApp Integration
- Parameterized template messages
- Dynamic variable injection (e.g., `{{first_name}}`)
- Delivery status tracking

### 📊 Data Visualization
- Dynamic table generation from submissions
- Fixed-header scrollable tables (handles 10,000+ rows)
- One-click CSV export with proper formatting

### 🔐 Security
- Firebase Authentication (Email/Password + Google)
- Firestore security rules for data isolation
- Environment variable configuration

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | HTML5, CSS3, Vanilla JavaScript (ES6+) |
| Backend | FastAPI (Python 3.12), pandas, requests |
| Database | Firebase Firestore (NoSQL) |
| Auth | Firebase Authentication |
| APIs | WhatsApp Business API, Google Sheets API |
| Styling | Select2, Font Awesome, Custom CSS |

## 🚀 Quick Start

### Prerequisites
- Python 3.12+
- Firebase account (free tier)
- WhatsApp Business API access (Meta Developer account)
- ngrok (for local testing)
