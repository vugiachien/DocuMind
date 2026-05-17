# DocuMind — Hệ thống Rà soát Hợp đồng Thông minh

> **Đồ án tốt nghiệp**
> Đại học Công nghiệp Hà Nội — Trường Công nghệ Thông tin và Truyền thông

---

## Mục lục

1. [Giới thiệu](#1-giới-thiệu)
2. [Tính năng chính](#2-tính-năng-chính)
3. [Kiến trúc hệ thống](#3-kiến-trúc-hệ-thống)
4. [Công nghệ sử dụng](#4-công-nghệ-sử-dụng)
5. [Cấu trúc thư mục](#5-cấu-trúc-thư-mục)
6. [Hướng dẫn cài đặt & chạy](#6-hướng-dẫn-cài-đặt--chạy)
7. [Biến môi trường](#7-biến-môi-trường)
8. [CI/CD & Triển khai](#8-cicd--triển-khai)
9. [Nhóm thực hiện](#9-nhóm-thực-hiện)

---

## 1. Giới thiệu

**DocuMind** là một nền tảng web hỗ trợ rà soát hợp đồng tự động ứng dụng trí tuệ nhân tạo (AI). Hệ thống cho phép người dùng tải lên văn bản hợp đồng (PDF, DOCX), sau đó tự động phân tích và phát hiện các rủi ro pháp lý, điều khoản bất lợi, thiếu sót so với mẫu chuẩn hoặc bộ quy tắc kiểm soát (Playbook) được định nghĩa sẵn.

Điểm cốt lõi của hệ thống là pipeline AI sử dụng kỹ thuật **RAG (Retrieval-Augmented Generation)** kết hợp **Large Language Model (LLM)**, cho phép:

- So khớp từng điều khoản hợp đồng với bộ quy tắc liên quan nhất trong cơ sở tri thức.
- Phát hiện mâu thuẫn thực thể (tên công ty, mã số thuế, đại diện ký kết).
- Chỉ ra các điều khoản bắt buộc còn thiếu.
- So sánh hợp đồng với mẫu chuẩn để tìm sai lệch.

---

## 2. Tính năng chính

### Quản lý Hợp đồng
- Upload hợp đồng dạng PDF hoặc DOCX; xem trước trực tiếp trên trình duyệt.
- Quản lý vòng đời hợp đồng: Draft → Pending Review → Reviewed → Signed / Rejected.
- Soft-delete với khả năng khôi phục (chỉ Admin).
- Chia sẻ hợp đồng theo người dùng hoặc phòng ban với phân quyền `view` / `edit`.
- Hệ thống bình luận nội bộ (platform comment) gắn vào từng hợp đồng.

### Phân tích AI (RAG Pipeline)
- **Rule-based analysis**: so khớp điều khoản với quy tắc trong Playbook qua vector search (ChromaDB / Milvus).
- **Template-based analysis**: phát hiện sai lệch so với hợp đồng mẫu.
- **Entity conflict detection**: phát hiện mâu thuẫn thông tin thực thể trong toàn bộ văn bản.
- **Missing clause detection**: xác định điều khoản bắt buộc còn thiếu theo loại hợp đồng.
- Kết quả phân tích phân loại theo mức độ rủi ro: `critical`, `high`, `medium`, `low`.
- Gợi ý sửa đổi điều khoản và chỉnh sửa trực tiếp trong giao diện (rich-text editor).

### Quản lý Playbook (Bộ quy tắc kiểm soát)
- Upload file Playbook (PDF, DOCX, TXT); hệ thống tự động trích xuất quy tắc bằng LLM.
- Nhúng quy tắc vào vector database phục vụ tìm kiếm ngữ nghĩa.
- Liên kết Playbook với loại hợp đồng cụ thể.

### Quản lý người dùng & tổ chức
- Xác thực JWT; phân quyền Admin / User.
- Quản lý phòng ban; gán người dùng vào phòng ban.
- Quản lý avatar người dùng (lưu trữ MinIO).
- Nhật ký kiểm tra (Audit log) cho mọi hành động trên hợp đồng.

### Dashboard & Báo cáo
- Thống kê tổng quan: số lượng hợp đồng theo trạng thái, theo đối tác, theo loại.
- Biểu đồ phân bổ rủi ro.

---

## 3. Kiến trúc hệ thống

```
┌─────────────────────────────────────────────────────────┐
│                       Client Browser                     │
│              React 18 + Ant Design + Vite                │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTP / REST API
┌───────────────────────────▼─────────────────────────────┐
│                  Backend (Monolith)                       │
│              FastAPI + SQLAlchemy + Celery                │
│                                                           │
│  ┌──────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │  REST API    │  │  AI Engine  │  │  Celery Worker  │ │
│  │  (routers)   │  │  RAG/LLM    │  │  (async tasks)  │ │
│  └──────┬───────┘  └──────┬──────┘  └────────┬────────┘ │
└─────────┼─────────────────┼───────────────────┼──────────┘
          │                 │                   │
   ┌──────▼──────┐  ┌───────▼───────┐  ┌───────▼───────┐
   │  PostgreSQL │  │  ChromaDB /   │  │     Redis     │
   │  (metadata) │  │  Milvus       │  │  (task queue) │
   └─────────────┘  │  (vectors)    │  └───────────────┘
                    └───────┬───────┘
                            │
                    ┌───────▼───────┐
                    │     MinIO     │
                    │  (file store) │
                    └───────────────┘
```

**Luồng phân tích hợp đồng:**

```
Upload file ──► Parse DOCX/PDF ──► Chia section
    ──► Embed section (Sentence Transformers)
    ──► Vector Search (top-k rules từ Playbook)
    ──► LLM phân tích từng section + matched rules
    ──► Aggregate: entity conflict + missing clauses
    ──► Lưu kết quả Finding vào PostgreSQL
    ──► Trả về UI
```

---

## 4. Công nghệ sử dụng

| Tầng | Công nghệ |
|---|---|
| Frontend | React 18, TypeScript, Vite, Ant Design 6, TailwindCSS 4, TinyMCE |
| Backend API | Python 3.11+, FastAPI, SQLAlchemy 2, Alembic, Pydantic v2 |
| AI / NLP | OpenAI API (LLM), Sentence Transformers, ChromaDB, Milvus |
| Document parsing | pdfplumber, python-docx, mammoth, pdf2docx |
| Task queue | Celery, Redis |
| Database | PostgreSQL 15 |
| File storage | MinIO (S3-compatible) |
| Containerization | Docker, Docker Compose |
| CI/CD | GitLab CI/CD |

---

## 5. Cấu trúc thư mục

```
DocuMind/
├── backend/                    # FastAPI backend + AI engine
│   ├── app/
│   │   ├── api/                # Shared API utilities
│   │   ├── core/               # Config, auth, middleware, rate limiter
│   │   ├── db/                 # SQLAlchemy models, migrations
│   │   ├── modules/            # Business logic theo domain
│   │   │   ├── agreements/     # Hợp đồng (CRUD, share, comment)
│   │   │   ├── audit_policies/ # Playbook (upload, extract rules)
│   │   │   ├── departments/    # Phòng ban
│   │   │   ├── notifications/  # Thông báo nội bộ
│   │   │   └── users/          # Auth, user management
│   │   ├── services/
│   │   │   ├── ai/             # RAG pipeline, LLM client, vector store
│   │   │   ├── storage_service.py   # MinIO adapter
│   │   │   ├── document_service.py  # DOCX text replacement
│   │   │   └── audit_service.py     # Audit logging
│   │   └── tasks/              # Celery async tasks
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/                   # React SPA
│   ├── src/
│   │   ├── pages/
│   │   │   ├── contracts/      # Danh sách, chi tiết, tạo hợp đồng
│   │   │   ├── library/        # Playbook & contract type management
│   │   │   ├── dashboard/      # Trang tổng quan
│   │   │   ├── partners/       # Quản lý đối tác
│   │   │   ├── settings/       # Cài đặt người dùng
│   │   │   └── admin/          # Trang quản trị
│   │   ├── components/         # UI components dùng chung
│   │   ├── services/           # Axios API clients
│   │   ├── contexts/           # React context (auth, ...)
│   │   └── types/              # TypeScript type definitions
│   └── Dockerfile
│
├── docker-compose.yml          # Môi trường phát triển local
├── docker-compose.prod.yml     # Môi trường production
├── .gitlab-ci.yml              # CI/CD pipeline
└── deploy.sh                   # Script deploy lên server
```

---

## 6. Hướng dẫn cài đặt & chạy

### Yêu cầu
- Docker >= 24 và Docker Compose v2
- OpenAI API key (hoặc compatible endpoint)
- MinIO instance (hoặc dùng container trong docker-compose)

### Chạy toàn bộ hệ thống bằng Docker Compose

```bash
# 1. Clone repository
git clone <repo-url>
cd DocuMind

# 2. Tạo file .env từ mẫu
cp backend/.env.example backend/.env
# Điền các biến cần thiết (xem mục 7)

# 3. Khởi động hạ tầng (PostgreSQL, Redis, MinIO)
bash run_infrastructure.sh

# 4. Khởi động backend
bash run_backend_local.sh

# 5. Khởi động worker Celery
bash run_worker_local.sh

# 6. Khởi động frontend
bash run_frontend_local.sh
```

Hoặc chạy tất cả cùng lúc:

```bash
bash run_all_local.sh
```

**Hoặc dùng Docker Compose (production-like):**

```bash
docker compose up --build
```

| Dịch vụ | URL mặc định |
|---|---|
| Frontend | http://localhost:5175 |
| Backend API | http://localhost:8012 |
| API Docs (Swagger) | http://localhost:8012/docs |
| MinIO Console | http://localhost:9001 |

### Chạy từng phần (không dùng Docker)

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
```

---

## 7. Biến môi trường

Tạo file `backend/.env` với các biến sau:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5436/documind_db

# Redis / Celery
REDIS_URL=redis://localhost:6390/0
CELERY_BROKER_URL=redis://localhost:6390/0

# LLM (OpenAI-compatible)
OPENAI_API_KEY=sk-...
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o

# MinIO (file storage)
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=documind
MINIO_USE_SSL=false

# App
SECRET_KEY=your-secret-key-here
ENVIRONMENT=development
DEBUG=true
```

---

## 8. CI/CD & Triển khai

Pipeline GitLab CI gồm 2 stage:

```
build (parallel)          deploy
─────────────────         ──────────────────────────────
build-backend    ─┐
build-frontend   ─┼──►   deploy-dev (SSH + docker compose)
build-ai-service ─┘
```

- **Trigger**: push lên nhánh `develop`.
- **Build**: Docker image được build với BuildKit cache, push lên GitLab Container Registry.
- **Deploy**: rsync `docker-compose.prod.yml` lên server, kéo image mới và restart container.

---

## 9. Thông tin đồ án

| | |
|---|---|
| **Sinh viên thực hiện** | Vũ Gia Chiến |
| **Giảng viên hướng dẫn** | *(bổ sung)* |
| **Năm thực hiện** | 2025 – 2026 |
