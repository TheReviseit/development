"""
Quick setup verification script for WhatsApp Admin Backend
Run this to check if everything is configured correctly
"""

import os
import sys

def check_env_file():
    """Check if .env file exists and has required variables"""
    print("\n📋 Checking .env file...")
    
    if not os.path.exists('.env'):
        print("❌ .env file not found!")
        print("   Create one by copying .env.example")
        return False
    
    print("✅ .env file exists")
    
    # Load and check for placeholder values
    with open('.env', 'r') as f:
        content = f.read()
        
    required_vars = [
        'WHATSAPP_PHONE_NUMBER_ID',
        'WHATSAPP_ACCESS_TOKEN',
        'FRONTEND_URL'
    ]
    
    for var in required_vars:
        if var not in content:
            print(f"❌ Missing variable: {var}")
            return False
        print(f"✅ Found: {var}")
    
    if 'placeholder' in content.lower():
        print("\n⚠️  WARNING: Detected placeholder credentials")
        print("   Replace these with real WhatsApp API credentials")
        return False
    
    return True


def check_dependencies():
    """Check if required Python packages are installed"""
    print("\n📦 Checking dependencies...")
    
    required = ['flask', 'flask_cors', 'requests', 'dotenv']
    missing = []
    
    for package in required:
        try:
            __import__(package)
            print(f"✅ {package}")
        except ImportError:
            print(f"❌ {package}")
            missing.append(package)
    
    if missing:
        print("\n❌ Missing packages. Install with:")
        print("   pip install -r requirements.txt")
        return False
    
    return True


def check_files():
    """Check if all required files exist"""
    print("\n📁 Checking files...")
    
    required_files = [
        'app.py',
        'whatsapp_service.py',
        'requirements.txt',
        '.env.example'
    ]
    
    all_exist = True
    for file in required_files:
        if os.path.exists(file):
            print(f"✅ {file}")
        else:
            print(f"❌ {file}")
            all_exist = False
    
    return all_exist


def main():
    print("=" * 50)
    print("🔍 WhatsApp Admin Backend - Setup Verification")
    print("=" * 50)
    
    # Change to backend directory if not already there
    if not os.path.exists('app.py'):
        print("\n❌ Error: Run this script from the backend/ directory")
        print("   cd backend")
        print("   python check_setup.py")
        sys.exit(1)
    
    files_ok = check_files()
    deps_ok = check_dependencies()
    env_ok = check_env_file()
    
    print("\n" + "=" * 50)
    
    if files_ok and deps_ok and env_ok:
        print("✅ All checks passed! Ready to start the server")
        print("\n🚀 Run: python app.py")
    else:
        print("❌ Some checks failed. Review the issues above.")
        if not env_ok:
            print("\n📝 Next steps:")
            print("1. Edit .env file with your WhatsApp credentials")
            print("2. Get credentials from: https://developers.facebook.com/")
        if not deps_ok:
            print("\n📦 Install dependencies:")
            print("   pip install -r requirements.txt")
    
    print("=" * 50)


if __name__ == '__main__':
    main()
