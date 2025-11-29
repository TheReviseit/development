# ReviseIt - AI-Powered WhatsApp Automation SaaS


<div align="center">
  <h1>🚀 ReviseIt</h1>
  <p><strong>Production-Ready Multi-Tenant WhatsApp Automation Platform</strong></p>
  <p>Built with FastAPI, Next.js 15, PostgreSQL, and AI-powered conversation handling</p>
</div>

---

## ✨ Features

### 🔐 **Enterprise Authentication**
- JWT-based authentication (access + refresh tokens)
- Multi-tenant business workspaces (like Slack)
- Role-based access control (Owner, Admin, Member)

### 💬 **WhatsApp Cloud API Integration**
- Complete webhook handling for incoming messages
- Support for text, templates, buttons, and interactive messages
- Message status tracking (sent, delivered, read)

### 🤖 **Advanced AI Automation**
- **Intent Classification**: Detect customer intent (appointment, pricing, support, ordering)
- **AI Response Generation**: Context-aware responses using OpenAI
- **Conversation Memory**: Track customer attributes and conversation history
- **Lead Scoring**: Automatic qualification (cold/warm/hot)
- **Workflow Builder**: Configurable automation flows with triggers and actions
- **Industry Templates**: Pre-built automations for restaurants, clinics, real estate, e-commerce, salons

### 📊 **CRM System**
- Customer management with tagging and segmentation
- Conversation history tracking
- Lead funnel stages
- Custom notes and attributes

### 📢 **Campaign & Broadcast Engine**
- Bulk messaging with audience segmentation
- Scheduled campaigns
- Delivery tracking and analytics

### ⏰ **Auto Follow-Up System**
- Automatic reminder scheduling (1h, 24h, 48h)
- Smart detection of customer inactivity

---

## 🏗️ **Tech Stack**

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.11, FastAPI |
| **Frontend** | Next.js 15 (App Router), TypeScript, Tailwind CSS |
| **Database** | PostgreSQL 15 |
| **ORM** | SQLAlchemy + Alembic |
| **Queue** | Celery + Redis |
| **AI** | OpenAI (configurable) |
| **Deployment** | Docker + Docker Compose |

---

## 📁 **Project Structure**

```
reviseit/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app entry point
│   │   ├── config.py            # Environment configuration
│   │   ├── db.py                # Database session management
│   │   ├── celery_app.py        # Celery configuration
│   │   ├── models/              # SQLAlchemy models
│   │   ├── schemas/             # Pydantic schemas
│   │   ├── api/                 # API endpoints
│   │   ├── core/                # Auth & security
│   │   ├── services/            # Business logic
│   │   ├── ai/                  # AI automation layer
│   │   └── tasks/               # Celery tasks
│   ├── alembic/                 # Database migrations
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── app/                     # Next.js App Router pages
│   ├── components/              # Reusable UI components
│   ├── lib/                     # Utilities (API client, auth)
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
├── Makefile
└── README.md
```

---

## 🚀 **Quick Start**

### **Prerequisites**
- Docker & Docker Compose
- Node.js 20+ (for local development)
- Python 3.11+ (for local development)
- PostgreSQL 15+ (if running locally)
- Redis (if running locally)

### **Option 1: Docker (Recommended)**

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd Reviseit
```

2. **Copy environment file**
```bash
cp .env.example .env
```

3. **Update environment variables**
Edit `.env` and set:
- `JWT_SECRET` and `JWT_REFRESH_SECRET` (generate secure random strings)
- `WHATSAPP_VERIFY_TOKEN` (your custom verify token)
- `OPENAI_API_KEY` (from https://platform.openai.com)

4. **Start all services**
```bash
docker-compose up --build
```

5. **Access the application**
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### **Option 2: Local Development**

1. **Backend Setup**
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env

# Run database migrations
alembic upgrade head

# Start backend server
uvicorn app.main:app --reload

# In separate terminals:
# Start Celery worker
celery -A app.celery_app worker --loglevel=info

# Start Celery beat
celery -A app.celery_app beat --loglevel=info
```

2. **Frontend Setup**
```bash
cd frontend

# Install dependencies
npm install

# Create .env file
cp .env.example .env.local

# Start development server
npm run dev
```

---

## 📱 **WhatsApp Cloud API Setup**

### 1. **Create Meta Business App**
- Go to https://developers.facebook.com
- Create a new app → Select "Business" type
- Add "WhatsApp" product

### 2. **Get Credentials**
You need:
- **Phone Number ID**: From WhatsApp > API Setup
- **Business Account ID**: From WhatsApp > API Setup
- **Access Token**: Generate a permanent token
- **Webhook Verify Token**: Create your own (e.g., `my_custom_token_123`)

### 3. **Configure Webhook**
1. Deploy your backend (or use ngrok for testing)
2. Webhook URL: `https://your-domain.com/api/webhook/whatsapp`
3. Verify token: Use the same token from `.env`
4. Subscribe to: `messages`

### 4. **Update Backend Settings**
In your application (Settings page), add:
- Phone Number ID
- Business Account ID
- Access Token
- Webhook Verify Token

---

## 🎨 **Frontend Design System**

The frontend follows a strict **black & white monochrome theme** with:
- **Typography**: Inter (Google Fonts)
- **Color Palette**: Grayscale only (black, white, and gray shades)
- **Components**: Premium card designs with soft shadows
- **Interactions**: Smooth transitions and hover effects
- **Responsive**: Mobile-first design

---

## 🔧 **API Endpoints**

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user

### Business Management
- `POST /api/businesses` - Create business workspace
- `GET /api/businesses` - List my businesses
- `GET /api/businesses/{id}` - Get business details
- `POST /api/businesses/{id}/whatsapp-credentials` - Configure WhatsApp

### WhatsApp Webhook
- `GET /api/webhook/whatsapp` - Webhook verification
- `POST /api/webhook/whatsapp` - Receive messages

Full API documentation: http://localhost:8000/docs

---

## 🧪 **Testing**

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test
```

---

## 🤝 **Contributing**

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 **Environment Variables Reference**

See `.env.example` for complete list. Key variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | ✅ |
| `REDIS_URL` | Redis connection string | ✅ |
| `JWT_SECRET` | JWT signing key | ✅ |
| `WHATSAPP_VERIFY_TOKEN` | Webhook verification | ✅ |
| `OPENAI_API_KEY` | OpenAI API key | Optional |

---

## 🐛 **Troubleshooting**

### Docker Issues
```bash
# Reset everything
docker-compose down -v
docker-compose up --build
```

### Database Migrations
```bash
# Recreate migrations
cd backend
alembic revision --autogenerate -m "description"
alembic upgrade head
```

### Port Conflicts
If ports 3000, 8000, 5432, or 6379 are in use, update `docker-compose.yml`

---

## 📄 **License**

This project is licensed under the MIT License.

---

## 🙌 **Acknowledgments**

- Built with [FastAPI](https://fastapi.tiangolo.com/)
- Frontend powered by [Next.js](https://nextjs.org/)
- WhatsApp integration via [Meta Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api)
- AI by [OpenAI](https://openai.com/)

---

<div align="center">
  <p>Made with ❤️ for amazing WhatsApp automation</p>
  <p><strong>ReviseIt</strong> - Scale your customer conversations with AI</p>
</div>
