import { jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';

// Edge-compatible JWT verification for Middleware
export const verifyJwtEdge = async (token: string) => {
    try {
        const secret = new TextEncoder().encode(JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);
        return payload;
    } catch (error) {
        return null;
    }
};
