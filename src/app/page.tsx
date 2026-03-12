import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Typography } from '@/components/ui/Typography';
import { Container, Grid } from '@/components/layout/Primitives';

export default function Home() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
            {/* Background elements for premium feel */}
            <div className="absolute top-0 w-full h-full bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(139,92,246,0.15),rgba(255,255,255,0))] pointer-events-none" />

            <Container className="relative z-10 py-24 text-center space-y-space-12">
                <div className="max-w-3xl mx-auto space-y-space-6 animate-in slide-in-from-bottom duration-premium flex flex-col items-center">
                    <Typography variant="display" className="text-text-primary tracking-tight">
                        Modern Authentication
                    </Typography>
                    <Typography variant="body" className="text-text-secondary text-lg max-w-2xl text-balance">
                        Secure, scalable, and premium authentication system built with Next.js,
                        Prisma, MongoDB, and a bespoke Dark Luxury UI design.
                    </Typography>

                    <div className="flex gap-space-4 pt-space-4">
                        <Link href="/login">
                            <Button size="lg" className="min-w-32">Get Started</Button>
                        </Link>
                        <Link href="/register">
                            <Button variant="outline" size="lg" className="min-w-32">Learn More</Button>
                        </Link>
                    </div>
                </div>

                <Grid cols={{ sm: 1, md: 3 }} gap="space-6" className="pt-space-12 text-left">
                    <Card className="h-full bg-background-surface/80 backdrop-blur-md">
                        <CardContent className="p-space-6 space-y-space-3 pt-space-6">
                            <Typography variant="h3" className="text-text-primary">Secure</Typography>
                            <Typography variant="small" className="text-text-secondary leading-relaxed">
                                JWT-based authentication with HttpOnly cookies, seamless session management, and CSRF protection.
                            </Typography>
                        </CardContent>
                    </Card>
                    <Card className="h-full bg-background-surface/80 backdrop-blur-md">
                        <CardContent className="p-space-6 space-y-space-3 pt-space-6">
                            <Typography variant="h3" className="text-text-primary">Modern</Typography>
                            <Typography variant="small" className="text-text-secondary leading-relaxed">
                                Built natively with the latest tech stack: Next.js App Router, React 19, and pure Tailwind Design Tokens.
                            </Typography>
                        </CardContent>
                    </Card>
                    <Card className="h-full bg-background-surface/80 backdrop-blur-md">
                        <CardContent className="p-space-6 space-y-space-3 pt-space-6">
                            <Typography variant="h3" className="text-text-primary">Role-Based</Typography>
                            <Typography variant="small" className="text-text-secondary leading-relaxed">
                                Granular access control securely integrating Admin and User roles directly into the React tree.
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Container>
        </div>
    );
}
