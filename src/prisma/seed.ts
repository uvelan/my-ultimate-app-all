import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
        throw new Error('ADMIN_PASSWORD environment variable is not set');
    }
    const password = await bcrypt.hash(adminPassword, 12);

    const admin = await prisma.user.upsert({
        where: { email: 'admin@example.com' },
        update: {},
        create: {
            email: 'admin@example.com',
            name: 'Admin User',
            password,
            role: 'ADMIN',
        },
    });

    console.log({ admin });
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
