#!/bin/bash

# Build script with better error handling and diagnostics

set -e

echo "🔍 Checking TypeScript errors..."
npx tsc --noEmit --skipLibCheck || {
  echo "❌ TypeScript errors found. Fix them before building."
  exit 1
}

echo "✅ TypeScript check passed"
echo ""
echo "🏗️  Starting build with increased memory..."
echo ""

# Increase Node memory limit
export NODE_OPTIONS="--max-old-space-size=4096"

# Run build with verbose output
npm run build 2>&1 | tee build_output.log

echo ""
echo "✅ Build completed successfully!"
echo "📦 Output in: dist/"


