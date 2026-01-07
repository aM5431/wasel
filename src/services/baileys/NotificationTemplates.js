const sessionManager = require('./SessionManager');

class NotificationTemplates {
    /**
     * Get subscription activation message
     */
    static getActivationMessage(userName, planName, duration, endDate) {
        const text = `🎉 *مرحباً ${userName}!*\n\n` +
            `تم تفعيل اشتراكك بنجاح في منصة *واصل* ✅\n\n` +
            `📦 *الباقة:* ${planName}\n` +
            `⏰ *المدة:* ${duration} يوم\n` +
            `📅 *تاريخ البدء:* ${new Date().toLocaleDateString('ar-EG')}\n` +
            `📅 *تاريخ الانتهاء:* ${new Date(endDate).toLocaleDateString('ar-EG')}\n\n` +
            `يمكنك الآن الاستفادة من جميع مميزات الباقة من خلال لوحة التحكم.\n\n` +
            `شكراً لثقتك بنا! 🙏`;

        const buttons = [
            { id: 'dashboard', text: '🏠 لوحة التحكم' },
            { id: 'support', text: '💬 الدعم الفني' }
        ];

        return { text, buttons };
    }

    /**
     * Get welcome message for new registration
     */
    static getWelcomeMessage(userName, email) {
        const text = `👋 *أهلاً ${userName}!*\n\n` +
            `شكراً لتسجيلك في منصة *واصل* - منصة إدارة رسائل الواتساب\n\n` +
            `✨ تم إنشاء حسابك بنجاح\n` +
            `📧 *البريد الإلكتروني:* ${email}\n\n` +
            `يمكنك الآن اختيار الباقة المناسبة لك والبدء في استخدام المنصة.\n\n` +
            `نتمنى لك تجربة موفقة! 🚀`;

        const buttons = [
            { id: 'plans', text: '📦 عرض الباقات' },
            { id: 'trial', text: '🎁 تجربة مجانية' }
        ];

        return { text, buttons };
    }

    /**
     * Get subscription expiry warning
     */
    static getExpiryWarning(userName, daysRemaining, endDate) {
        const text = `⚠️ *تنبيه هام*\n\n` +
            `عزيزي ${userName},\n\n` +
            `باقتك ستنتهي خلال *${daysRemaining} ${daysRemaining === 1 ? 'يوم' : 'أيام'}*\n\n` +
            `📅 *تاريخ الانتهاء:* ${new Date(endDate).toLocaleDateString('ar-EG')}\n\n` +
            `قم بالتجديد الآن لتجنب انقطاع الخدمة والاستمرار في الاستفادة من مميزات المنصة.\n\n` +
            `نحن دائماً في خدمتك! 💚`;

        const buttons = [
            { id: 'renew', text: '🔄 تجديد الآن' },
            { id: 'upgrade', text: '⬆️ ترقية الباقة' }
        ];

        return { text, buttons };
    }

    /**
     * Get subscription expired message
     */
    static getExpiredMessage(userName) {
        const text = `❌ *انتهى الاشتراك*\n\n` +
            `عزيزي ${userName},\n\n` +
            `للأسف انتهت صلاحية باقتك.\n\n` +
            `لا تقلق! يمكنك تجديد اشتراكك في أي وقت والعودة للاستمتاع بخدماتنا.\n\n` +
            `نحن في انتظارك! 🙏`;

        const buttons = [
            { id: 'renew', text: '🔄 تجديد الاشتراك' },
            { id: 'contact', text: '📞 تواصل معنا' }
        ];

        return { text, buttons };
    }

    /**
     * Get payment confirmation message
     */
    static getPaymentConfirmation(userName, amount, planName) {
        const text = `✅ *تم استلام طلبك*\n\n` +
            `عزيزي ${userName},\n\n` +
            `تم استلام طلب الاشتراك الخاص بك بنجاح!\n\n` +
            `📦 *الباقة:* ${planName}\n` +
            `💰 *المبلغ:* ${amount} جنيه\n\n` +
            `سيتم مراجعة طلبك وتفعيل الباقة خلال 24 ساعة.\n\n` +
            `سنرسل لك إشعاراً فور التفعيل. شكراً لصبرك! ⏳`;

        return { text };
    }

    /**
     * Get custom message template
     */
    static getCustomMessage(title, body, buttons = []) {
        const text = `*${title}*\n\n${body}`;
        return { text, buttons };
    }

    /**
     * Send notification using session
     */
    static async sendNotification(sessionId, phoneNumber, templateType, data) {
        const messageService = require('./MessageService');

        let template;

        switch (templateType) {
            case 'activation':
                template = this.getActivationMessage(
                    data.userName,
                    data.planName,
                    data.duration,
                    data.endDate
                );
                break;

            case 'welcome':
                template = this.getWelcomeMessage(data.userName, data.email);
                break;

            case 'expiry_warning':
                template = this.getExpiryWarning(
                    data.userName,
                    data.daysRemaining,
                    data.endDate
                );
                break;

            case 'expired':
                template = this.getExpiredMessage(data.userName);
                break;

            case 'payment_confirmation':
                template = this.getPaymentConfirmation(
                    data.userName,
                    data.amount,
                    data.planName
                );
                break;

            default:
                throw new Error(`Unknown template type: ${templateType}`);
        }

        // Send with or without buttons
        if (template.buttons && template.buttons.length > 0) {
            return await messageService.sendButtonMessage(
                sessionId,
                phoneNumber,
                template.text,
                template.buttons
            );
        } else {
            return await messageService.sendMessage(
                sessionId,
                phoneNumber,
                template.text
            );
        }
    }
}

module.exports = NotificationTemplates;
