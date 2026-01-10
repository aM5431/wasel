const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../src/database/app.db');
const db = new sqlite3.Database(dbPath);

const plans = [
    {
        name: 'الباقة الأساسية',
        price: 0,
        duration_days: 14,
        is_trial: 1,
        features: JSON.stringify({
            list: [
                "تجربة شاملة لمدة 14 يوم",
                "إدارة جلسة واتساب واحدة",
                "إرسال إشعارات الصلاة والأذكار",
                "دعم فني محدود",
                "لوحة تحكم عصرية"
            ]
        })
    },
    {
        name: 'الباقة المتقدمة',
        price: 150,
        duration_days: 30,
        is_trial: 0,
        features: JSON.stringify({
            list: [
                "كل مميزات الباقة الأساسية",
                "ربط حتى 3 جلسات واتساب",
                "بوت الرد الآلي الذكي",
                "إدارة الحملات الإعلانية",
                "أولوية في الدعم الفني",
                "إحصائيات وتقارير مفصلة"
            ]
        })
    },
    {
        name: 'الباقة الاحترافية',
        price: 400,
        duration_days: 90,
        is_trial: 0,
        features: JSON.stringify({
            list: [
                "حلول متكاملة للمؤسسات",
                "جلسات واتساب غير محدودة",
                "ربط برمجيات API (Webhook)",
                "تخصيص كامل للهوية البصرية",
                "مدير حساب شخصي",
                "دعم فني 24/7 عبر الهاتف"
            ]
        })
    }
];

db.serialize(() => {
    // Clear existing plans
    db.run("DELETE FROM plans", (err) => {
        if (err) {
            console.error("Error clearing plans:", err);
            return;
        }
        console.log("Cleared existing plans.");

        // Insert new plans
        const stmt = db.prepare("INSERT INTO plans (name, price, duration_days, is_trial, features) VALUES (?, ?, ?, ?, ?)");

        plans.forEach(plan => {
            stmt.run(plan.name, plan.price, plan.duration_days, plan.is_trial, plan.features, (err) => {
                if (err) console.error("Error inserting plan:", plan.name, err);
                else console.log("Inserted plan:", plan.name);
            });
        });

        stmt.finalize(() => {
            console.log("All plans updated successfully.");
            db.close();
        });
    });
});
