#!/bin/bash

# Accessibility AI System - Setup Script

set -e

echo "🚀 Setting up Accessibility AI System..."

# Check Node.js version
echo "📦 Checking Node.js version..."
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Error: Node.js 18 or higher is required"
    exit 1
fi
echo "✅ Node.js version OK"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build shared packages
echo "🔨 Building shared packages..."
npm run build

# Create environment file
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please update .env with your configuration"
fi

# Run type checking
echo "🔍 Running type checks..."
npm run type-check

# Run linting
echo "🧹 Running linter..."
npm run lint

# Run tests
echo "🧪 Running tests..."
npm test

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Update .env with your configuration"
echo "  2. Run 'npm run dev' to start development"
echo "  3. See README.md for more information"
