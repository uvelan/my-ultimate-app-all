import Link from 'next/link';
import { Card } from '@/components/ui/components';

export default function Home() {
    return (
        <div className="row justify-content-center align-items-center min-vh-75">
            <div className="col-md-8 text-center">
                <h1 className="display-3 fw-bold text-white mb-4 animate-fade-in">
                    Modern Authentication
                </h1>
                <p className="lead text-white mb-5 opacity-75">
                    Secure, scalable, and beautiful authentication system built with Next.js 16,
                    Prisma, MongoDB, and Bootstrap 5.
                </p>

                <div className="d-flex gap-3 justify-content-center">
                    <Link href="/login" className="btn btn-light btn-lg fw-bold px-5">
                        Get Started
                    </Link>
                    <Link href="/register" className="btn btn-outline-light btn-lg px-5">
                        Learn More
                    </Link>
                </div>

                <div className="row mt-5 g-4">
                    <div className="col-md-4">
                        <Card className="h-100 bg-white/10 border-0">
                            <h3 className="h5 text-white mb-3">Secure</h3>
                            <p className="text-white/70 mb-0">
                                JWT-based authentication with HttpOnly cookies and CSRF protection.
                            </p>
                        </Card>
                    </div>
                    <div className="col-md-4">
                        <Card className="h-100 bg-white/10 border-0">
                            <h3 className="h5 text-white mb-3">Modern</h3>
                            <p className="text-white/70 mb-0">
                                Built with the latest tech stack: Next.js 16, React 19, and Server Actions.
                            </p>
                        </Card>
                    </div>
                    <div className="col-md-4">
                        <Card className="h-100 bg-white/10 border-0">
                            <h3 className="h5 text-white mb-3">Role-Based</h3>
                            <p className="text-white/70 mb-0">
                                Granular access control with Admin and User roles.
                            </p>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
