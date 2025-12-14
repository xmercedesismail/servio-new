// src/pages/Home.tsx
import React from 'react';
import { Link } from 'react-router-dom';

const Home: React.FC = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">Welcome to Our App</h1>
        <p className="mb-4 text-xl text-muted-foreground">
          Please log in to continue.
        </p>
        <Link
          to="/auth"
          className="text-primary underline hover:text-primary/90"
        >
          Go to Login
        </Link>
      </div>
    </div>
  );
};

export default Home;