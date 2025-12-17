/**
 * エラーハンドリングミドルウェア
 */

/**
 * 共通エラーハンドラー
 */
function errorHandler(err, req, res, next) {
    console.error('❌ Server Error:', err);
    
    const statusCode = err.status || err.statusCode || 500;
    const message = err.message || 'Internal server error';
    
    res.status(statusCode).json({
        error: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
}

/**
 * 404ハンドラー
 */
function notFoundHandler(req, res) {
    res.status(404).json({
        error: `Not Found: ${req.method} ${req.path}`
    });
}

/**
 * リクエストロガー
 */
function requestLogger(req, res, next) {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        const logLevel = res.statusCode >= 400 ? '⚠️' : '✅';
        console.log(`${logLevel} ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    
    next();
}

module.exports = {
    errorHandler,
    notFoundHandler,
    requestLogger,
};
