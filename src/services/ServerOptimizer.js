// تحسينات الخادم لزيادة سرعة الاستجابة
const compression = require('compression');
const cluster = require('cluster');
const os = require('os');

class ServerOptimizer {
    static applyOptimizations(app) {
        // ضغط الاستجابات
        app.use(compression({
            level: 6,
            threshold: 1024,
            filter: (req, res) => {
                if (req.headers['x-no-compression']) {
                    return false;
                }
                return compression.filter(req, res);
            }
        }));

        // تحسين إعدادات Express
        app.set('trust proxy', 1);
        app.set('x-powered-by', false);

        // JSON parsing is already handled by express.json() middleware in server.js
        // Removing duplicate/unsafe middleware that was causing undefined JSON errors

        // إضافة headers للتحسين
        app.use((req, res, next) => {
            res.set({
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'X-Content-Type-Options': 'nosniff',
                'X-Frame-Options': 'DENY',
                'X-XSS-Protection': '1; mode=block'
            });
            next();
        });

        console.log('✅ Server optimizations applied');
    }

    static enableClustering() {
        const numCPUs = os.cpus().length;

        if (cluster.isMaster && numCPUs > 1) {
            console.log(`Master ${process.pid} is running`);
            console.log(`Starting ${Math.min(numCPUs, 4)} workers...`);

            // Fork workers
            for (let i = 0; i < Math.min(numCPUs, 4); i++) {
                cluster.fork();
            }

            cluster.on('exit', (worker, code, signal) => {
                console.log(`Worker ${worker.process.pid} died`);
                console.log('Starting a new worker...');
                cluster.fork();
            });

            return false; // Don't start server in master process
        }

        return true; // Start server in worker process
    }

    static optimizeNodeJS() {
        // تحسين إعدادات Node.js
        process.env.UV_THREADPOOL_SIZE = Math.max(4, os.cpus().length);

        // تحسين Garbage Collection
        if (process.env.NODE_ENV === 'production') {
            process.env.NODE_OPTIONS = '--max-old-space-size=2048 --optimize-for-size';
        }

        // معالجة الأخطاء غير المتوقعة
        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
            process.exit(1);
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
        });

        console.log('✅ Node.js optimizations applied');
    }
}

module.exports = ServerOptimizer;