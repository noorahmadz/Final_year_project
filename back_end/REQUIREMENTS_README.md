# Requirements Management Guide

This directory contains multiple requirements files for different purposes.

## Files Overview

| File | Purpose |
|------|---------|
| `requirements.txt` | Main dependencies with version ranges |
| `requirements-dev.txt` | Development and testing dependencies |
| `requirements-prod.txt` | Pinned exact versions for production |

## Quick Start

### Installation

**For development:**
```bash
pip install -r requirements.txt
pip install -r requirements-dev.txt
```

**For production:**
```bash
pip install -r requirements-prod.txt
```

---

## How to Generate Requirements

### Method 1: Using pip freeze (Recommended for production)

This method captures ALL installed packages in your environment:

```bash
# Activate your virtual environment
cd back_end
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

# Install packages
pip install Django djangorestframework etc.

# Generate requirements
pip freeze > requirements-generated.txt
```

**Note:** This captures ALL dependencies including transitive ones.

### Method 2: Using pipreqs (Recommended for cleaner requirements)

This method only captures packages directly imported in your code:

```bash
# Install pipreqs
pip install pipreqs

# Generate requirements from project directory
pipreqs . --force

# Or specify output file
pipreqs . --output-file requirements-custom.txt
```

### Method 3: Using pip-tools (For advanced dependency management)

```bash
# Install pip-tools
pip install pip-tools

# Generate requirements.in (direct dependencies only)
pip-compile requirements.in --output-file requirements.txt

# For development
pip-compile requirements-dev.in --output-file requirements-dev.txt
```

---

## Understanding the Requirements Files

### requirements.txt
- Contains core dependencies with flexible version ranges
- Best for development where you want latest compatible versions
- Comments explain purpose of each package

### requirements-prod.txt
- Contains EXACT pinned versions
- Essential for reproducible deployments
- Should be generated from a clean environment
- Use this for Docker containers and production servers

---

## Project Dependencies Explained

### Core Dependencies
- **Django 6.0.2** - Web framework (version from settings.py)
- **djangorestframework** - REST API building
- **django-cors-headers** - Cross-Origin Resource Sharing (essential for mobile apps)

### Optional but Recommended
- **Pillow** - Image processing (for user/gym images)
- **PyJWT** - Token authentication (for mobile API auth)
- **gunicorn** - Production WSGI server
- **whitenoise** - Static file serving for production

### Development Dependencies
- **pytest-django** - Testing framework
- **flake8/black** - Code formatting and linting
- **django-debug-toolbar** - Development debugging
- **factory-boy** - Test fixtures

---

## System Requirements

### Python Version
- **Python 3.10+** recommended (Django 6.0 requires Python 3.10+)

### Operating System
- Windows 10/11
- Linux (Ubuntu 20.04+, Debian 10+)
- macOS 11+

### Database
- **Development:** SQLite3 (built-in)
- **Production:** PostgreSQL 14+ or MySQL 8.0+

### Additional System Packages (Linux)
```bash
# For PostgreSQL
sudo apt-get install libpq-dev postgresql postgresql-contrib

# For MySQL
sudo apt-get install libmysqlclient-dev mysql-server

# For image processing
sudo apt-get install libjpeg-dev zlib1g-dev
```

---

## Docker Deployment

For Docker, use this in your Dockerfile:

```dockerfile
# Copy requirements
COPY requirements-prod.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements-prod.txt
```

---

## CI/CD Integration

### GitHub Actions Example
```yaml
- name: Install dependencies
  run: |
    python -m venv venv
    . venv/bin/activate
    pip install -r requirements-dev.txt

- name: Run tests
  run: pytest
```

---

## Troubleshooting

### "Python version not supported"
Make sure you're using Python 3.10 or higher:
```bash
python --version
```

### "No module named 'django'"
Make sure your virtual environment is activated:
```bash
# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate
```

### "Permission denied" on installation
Use `--user` flag or run as administrator:
```bash
pip install --user -r requirements.txt
```

---

## Best Practices

1. **Always use virtual environments** - Never install packages globally
2. **Pin versions for production** - Use `requirements-prod.txt`
3. **Keep requirements files in version control** - Track changes
4. **Update regularly** - Run `pip list --outdated` to check for updates
5. **Test before deploying** - Always test new versions in development first
6. **Use requirements-dev.txt in CI/CD** - Ensures all dev tools are available

---

## Updating Dependencies

```bash
# Check for outdated packages
pip list --outdated

# Update a specific package
pip install --upgrade Django

# Update all packages
pip install --upgrade -r requirements.txt
```

After updating, regenerate your production requirements:
```bash
pip freeze > requirements-prod.txt
```
