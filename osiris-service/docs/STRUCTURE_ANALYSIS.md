# OSIRIS Directory Structure Analysis

## Directory Hierarchy

```
/srv/projet/OSiris/
├── osiris_server.py          # Main WebSocket server (real-time face recognition)
├── known_faces/              # Storage for all face images (including UnknownGuest_X.jpg)
├── pretrained_model/         # dlib model files
│   ├── shape_predictor_68_face_landmarks.dat
│   ├── shape_predictor_5_face_landmarks.dat
│   └── dlib_face_recognition_resnet_model_v1.dat
├── easy_facial_recognition.py  # Utility script for face encoding
├── venv/                     # Python virtual environment
├── README.md                 # Project documentation
└── LICENSE.md                # License file
```

## Key Components

### 1. Face Detection & Encoding
- **Technology**: dlib frontal face detector + ResNet-based face encoder
- **Output**: 128-dimensional feature vectors (face embeddings)
- **Performance**: Optimized for real-time processing (upsample=1, num_jitters=0)

### 2. Face Recognition
- **Method**: Distance-based matching (Euclidean distance)
- **Tolerance**: 0.6 (configurable)
- **Database**: Loaded from `known_faces/` directory at startup

### 3. WebSocket Server
- **Port**: 8878 (localhost)
- **Protocol**: WebSocket for real-time video stream processing
- **Input**: JPEG-encoded frames via WebSocket
- **Output**: Annotated frames + JSON metadata

## New Multi-Face Tracking System

### Active Tracking Cache
- **Structure**: Dictionary mapping face embedding (tuple) -> {status, lct}
- **Status Values**: 'Unknown' or 'Known'
- **LCT**: Last Capture Timestamp (seconds since epoch)
- **Thread-Safe**: Protected by RLock

### Cooldown Logic
- **Period**: 10 seconds
- **Purpose**: Prevent duplicate captures of the same face
- **Applied**: Individually per face based on unique embedding

### Background Processing
- **Queue**: Thread-safe queue (maxsize=20)
- **Worker**: Daemon thread for asynchronous DB ingestion
- **Operations**: File saving, database reload, sequential naming

### Sequential Naming
- **Format**: `UnknownGuest_X.jpg` where X is globally incrementing
- **Location**: All files saved in `known_faces/` folder
- **Thread-Safe**: Protected by sequence_lock
