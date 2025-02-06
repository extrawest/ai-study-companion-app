# AI Study Companion App

[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg)]()
[![Maintaner](https://img.shields.io/static/v1?label=Oleksandr%20Samoilenko&message=Maintainer&color=red)](mailto:oleksandr.samoilenko@extrawest.com)
[![Ask Me Anything !](https://img.shields.io/badge/Ask%20me-anything-1abc9c.svg)]()
![GitHub license](https://img.shields.io/github/license/Naereen/StrapDown.js.svg)
![GitHub release](https://img.shields.io/badge/release-v1.0.0-blue)

## Overview

AI Study Companion is a powerful Flutter application that leverages artificial intelligence to enhance your learning experience. The app allows users to upload various document types (PDF, DOC, TXT, JPG, PNG) and receive AI-generated summaries and interactive quizzes based on the content.

## Key Features

-   **Document Processing**

    -   Support for multiple file formats (PDF, DOC, TXT, JPG, PNG)
    -   Upload up to 5 files simultaneously
    -   AI-powered document summarization
    -   Text extraction from images using OCR

-   **AI-Powered Learning**

    -   OpenAI GPT-3.5 and GPT-4 integration
    -   Intelligent document analysis
    -   Dynamic quiz generation

-   **Advanced Technology Stack**
    -   Vector similarity search using Pinecone
    -   Multi-agent system with Langgraph
    -   Real-time processing and analysis
    -   OCR for text extraction with @google-cloud/vision

## Technical Architecture

### Mobile App (Flutter)

-   BLoC pattern for state management
-   File handling and processing
-   Real-time communication with backend

### Backend Server (Node.js/TypeScript)

-   OpenAI integration
-   Pinecone vector database
-   Multi-agent system using Langgraph
-   Document processing pipeline

## Prerequisites

-   Flutter SDK (>=3.4.3)
-   Node.js (Latest LTS version)
-   OpenAI API Key
-   Pinecone API Key and Index

## Installation

### Mobile App Setup

1. Clone the repository:

```bash
git clone 
```

2. Navigate to the mobile app directory:

```bash
cd 
```

3. Install dependencies:

```bash
flutter pub get
```

### Server Setup

1. Navigate to the server directory:

```bash
cd 
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the server root with the following variables:

Create account in Google Cloud and download the JSON file
```env
GOOGLE_APPLICATION_CREDENTIALS_JSON = {YOUR GOOGLE APPLICATION CREDENTIALS JSON}
```
5. Start the server:

```bash
npx tsx server.ts
```

6. Update the server URL in the Flutter app:
    - Open `mobile/lib/services/api_service.dart`
    - Update the `baseUrl` to match your server address

## Project Structure

```
.
├── mobile/                 # Flutter application
│   ├── lib/               # Dart source files
│   ├── assets/           # App resources
│   └── pubspec.yaml      # Flutter dependencies
│
└── server/                # Backend server
    ├── services/         # Business logic
    ├── routes/           # API endpoints
    ├── tools/            # Utility scripts
    └── package.json      # Node.js dependencies
```

## Dependencies

### Mobile App

-   flutter_ai_toolkit: ^0.6.8
-   flutter_bloc: ^9.0.0
-   file_picker: ^8.1.7
-   flutter_chat_ui: ^1.6.15
-   http: ^1.3.0
-   And more (see pubspec.yaml)

### Server

-   @langchain/openai: ^0.3.14
-   @langchain/pinecone: ^0.1.3
-   @google-cloud/vision: 4.3.2
-   express: ^4.21.1
-   typescript: ^5.7.2
-   And more (see package.json)

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the MIT License - see the LICENSE.txt file for details.


Created by Oleksandr Samoilenko  
[Extrawest.com](https://www.extrawest.com), 2025
