# Use Node.js LTS version (20+)
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies for better-sqlite3 and other native modules
RUN apk add --no-cache python3 make g++ wget

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create necessary directories
RUN mkdir -p uploads src/auth_sessions src/database

# Set proper permissions
RUN chmod -R 755 /app

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001 || exit 1

# Start application
CMD ["npm", "start"]
