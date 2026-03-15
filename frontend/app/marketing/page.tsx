"use client";

import Link from "next/link";
import { Star, ArrowRight, Mail, Plus, Menu, X, Target } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { useAuthRedirect } from "@/app/hooks/useAuthRedirect";
import { useState } from "react";
import TrustedBy from "@/app/components/TrustedBy/TrustedBy";
import HowItWorks from "@/app/components/HowItWorks/HowItWorks";
import WhatsAppFeatures from "@/app/components/WhatsAppFeatures/WhatsAppFeatures";
import ContactSection from "@/app/components/ContactSection/ContactSection";
import Footer from "@/app/components/Footer/Footer";

export default function MarketingLandingPage() {
  const { handleLoginClick, handleGetStartedClick, isLoading } =
    useAuthRedirect();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900 selection:bg-gray-900 selection:text-white overflow-hidden flex flex-col">
      {/* Navigation */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="w-full relative z-50 pt-6 pb-4"
      >
        <div className="max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16">
          <div className="flex justify-between items-center">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <Link href="/" className="flex items-center gap-2">
                <Image
                  src="/logo.png"
                  alt="Flowauxi Logo"
                  width={32}
                  height={32}
                  className="object-contain"
                />
                <span className="text-xl font-bold tracking-tight text-[#111111]">
                  Flowauxi
                </span>
              </Link>
            </div>

            {/* Desktop Links */}
            <div className="hidden md:flex items-center gap-8 text-[15px] font-medium text-gray-600">
              <Link
                href="#"
                className="relative group text-[#1A1A1A] font-semibold pb-0.5"
              >
                Home
                <span className="absolute -bottom-1 left-0 w-full h-0.5 bg-[#1A1A1A]"></span>
              </Link>

              <Link
                href="#features"
                className="relative group hover:text-[#1A1A1A] transition-colors pb-0.5"
              >
                Features
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-[#1A1A1A] transition-all duration-300 ease-out group-hover:w-full"></span>
              </Link>
              <Link
                href="#how-it-works"
                className="relative group hover:text-[#1A1A1A] transition-colors pb-0.5"
              >
                How it works
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-[#1A1A1A] transition-all duration-300 ease-out group-hover:w-full"></span>
              </Link>
              <Link
                href="/pricing"
                className="relative group hover:text-[#1A1A1A] transition-colors pb-0.5"
              >
                Pricing
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-[#1A1A1A] transition-all duration-300 ease-out group-hover:w-full"></span>
              </Link>
              <Link
                href="#contact"
                className="relative group hover:text-[#1A1A1A] transition-colors pb-0.5"
              >
                Contact us
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-[#1A1A1A] transition-all duration-300 ease-out group-hover:w-full"></span>
              </Link>
            </div>

            {/* Desktop CTA */}
            <div className="hidden md:flex items-center gap-6">
              <a
                href="/login"
                onClick={handleLoginClick}
                className="text-[15px] font-semibold text-gray-700 hover:text-black transition-colors"
                style={{ opacity: isLoading ? 0.7 : 1 }}
              >
                {isLoading ? "..." : "Login"}
              </a>
              <a
                href="/signup"
                onClick={handleGetStartedClick}
                className="bg-[#1A1A1A] text-white px-7 py-3 rounded-full text-[15px] font-medium hover:bg-black transition-colors shadow-lg shadow-black/5 flex items-center justify-center leading-none"
                style={{ opacity: isLoading ? 0.7 : 1 }}
              >
                {isLoading ? "..." : "Sign up"}
              </a>
            </div>

            {/* Mobile Menu Toggle */}
            <div className="md:hidden flex items-center">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="text-gray-900 p-2 focus:outline-none"
              >
                {isMobileMenuOpen ? (
                  <X className="h-6 w-6" />
                ) : (
                  <Menu className="h-6 w-6" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-full left-0 w-full bg-white shadow-xl z-50 md:hidden flex flex-col items-center py-6 gap-6 border-t border-gray-100"
            >
              <Link
                href="#"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-[16px] font-semibold text-[#1A1A1A]"
              >
                Home
              </Link>

              <Link
                href="#features"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-[16px] font-medium text-gray-600 hover:text-[#1A1A1A]"
              >
                Features
              </Link>
              <Link
                href="#how-it-works"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-[16px] font-medium text-gray-600 hover:text-[#1A1A1A]"
              >
                How it works
              </Link>
              <Link
                href="/pricing"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-[16px] font-medium text-gray-600 hover:text-[#1A1A1A]"
              >
                Pricing
              </Link>
              <Link
                href="#contact"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-[16px] font-medium text-gray-600 hover:text-[#1A1A1A]"
              >
                Contact us
              </Link>

              <div className="w-full h-px bg-gray-100 my-2"></div>

              <a
                href="/login"
                onClick={(e) => {
                  handleLoginClick(e);
                  setIsMobileMenuOpen(false);
                }}
                className="text-[16px] font-semibold text-gray-700"
              >
                Login
              </a>
              <a
                href="/signup"
                onClick={(e) => {
                  handleGetStartedClick(e);
                  setIsMobileMenuOpen(false);
                }}
                className="bg-[#1A1A1A] text-white px-10 py-3 rounded-full text-[16px] font-medium shadow-lg"
              >
                Sign up
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>

      {/* Main Hero Section */}
      <main className="flex-1 w-full max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16 pt-12 lg:pt-20 pb-20 relative z-10 flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-8">
        {/* Left Column: Content */}
        <motion.div
          initial={{ x: -30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="w-full lg:w-[48%] max-w-2xl flex flex-col justify-center xl:pr-10 z-20"
        >
          {/* Reviews Badge */}
          <div className="flex items-center gap-3 mb-8">
            <div className="flex -space-x-2">
              <img
                src="https://i.pravatar.cc/100?img=11"
                alt="User"
                className="w-8 h-8 rounded-full border-2 border-white object-cover"
              />
              <img
                src="https://i.pravatar.cc/100?img=12"
                alt="User"
                className="w-8 h-8 rounded-full border-2 border-white object-cover grayscale"
              />
              <img
                src="https://i.pravatar.cc/100?img=13"
                alt="User"
                className="w-8 h-8 rounded-full border-2 border-white object-cover grayscale"
              />
            </div>
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className="w-4 h-4 fill-[#FF5A36] text-[#FF5A36]"
                />
              ))}
            </div>
            <span className="text-sm font-semibold text-gray-800">
              4.9{" "}
              <span className="font-normal text-gray-500">(454 reviews)</span>
            </span>
          </div>

          {/* Heading */}
          <h1 className="text-[56px] sm:text-[64px] lg:text-[72px] xl:text-[80px] font-bold leading-[1.05] tracking-tight text-[#111111] mb-8">
            <span style={{ color: "#22c15a" }}>AI</span> that runs your
            marketing while you{" "}
            <span className="relative inline-block whitespace-nowrap">
              <span style={{ color: "#22c15a" }}>scale</span>
              <motion.svg
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.8, ease: "easeInOut" }}
                className="absolute -bottom-3 left-0 w-full"
                viewBox="0 0 100 15"
                preserveAspectRatio="none"
              >
                <path
                  d="M0 10 Q 50 15 100 5"
                  stroke="#22c15a"
                  strokeWidth="6"
                  fill="none"
                  strokeLinecap="round"
                />
              </motion.svg>
            </span>
          </h1>

          {/* Subheading */}
          <p className="text-lg md:text-[19px] text-gray-500 leading-relaxed mb-10 max-w-[90%]">
            Stop spending hours managing campaigns, replying to leads, and
            tracking customer interactions. Our AI marketing engine
            automatically handles your outreach, engagement, and follow-ups so
            you can focus on growing your business.
          </p>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <Link
              href="#"
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#1A1A1A] text-white px-8 py-4 rounded-full text-[16px] font-medium hover:bg-black transition-colors"
            >
              Start Growing Now
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="#"
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white text-[#1A1A1A] border border-gray-200 px-8 py-4 rounded-full text-[16px] font-medium hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              See how it works
              <ArrowRight className="w-4 h-4 text-gray-500" />
            </Link>
          </div>
        </motion.div>

        {/* Right Column: Hero Image & Graphics */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
          className="w-full lg:w-[50%] relative flex justify-center lg:justify-end mt-24 sm:mt-32 lg:mt-0 xl:pr-10"
        >
          {/* Abstract Background Shapes */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] -z-10 bg-transparent flex flex-col items-center justify-center gap-4">
            {/* Creating the light gray pill shapes behind the person */}
            <div className="w-[85%] h-[200px] rounded-full bg-[#F2F3F4] absolute top-[5%] right-0 translate-x-[10%]"></div>
            <div className="w-[100%] h-[280px] rounded-full bg-[#F2F3F4] absolute top-[30%] right-0 translate-x-[5%] scale-105"></div>
            <div className="w-[90%] h-[240px] rounded-full bg-[#F2F3F4] absolute bottom-[5%] right-0 -translate-x-[5%]"></div>
          </div>

          {/* Main Character Image */}
          {/* We're using a high quality portrait of a smiling woman looking to the side */}
          <div className="relative z-10 max-w-[480px] xl:max-w-[550px] w-full">
            <img
              src="/marketing/hero_img.jpg"
              alt="Happy customer using phone"
              className="w-full h-auto object-cover rounded-b-[100px]"
              style={{
                clipPath: "inset(0px 0px 0px 0px)",
                maskImage:
                  "linear-gradient(to bottom, black 80%, transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, black 85%, transparent 100%)",
              }}
            />
          </div>

          {/* Floating Card 1: Subscribe */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8, x: -20, y: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            transition={{ duration: 0.6, delay: 1, type: "spring" }}
            className="absolute -top-12 sm:top-[20%] lg:top-[30%] -left-2 sm:left-4 lg:-left-12 bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] p-3 pr-4 flex items-center gap-3 z-40 scale-75 origin-top-left sm:scale-100"
          >
            <div className="bg-[#1A1A1A] p-2 rounded-lg">
              <Mail className="w-4 h-4 text-white" />
            </div>
            <span className="text-[13px] font-semibold text-gray-800">
              Subscribe Now Today
            </span>

            {/* Hand-drawn arrow SVG pointing to woman */}
            <div className="absolute -bottom-[60px] left-1/2 -translate-x-1/2 hidden md:block">
              <svg
                width="40"
                height="60"
                viewBox="0 0 53 66"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M25.7538 64.9189C25.7538 64.9189 31.9678 49.3879 40.5593 38.3812C46.8841 30.2763 51.536 26.6961 51.536 26.6961M51.536 26.6961C51.536 26.6961 46.1265 29.5601 39.4359 30.2763M51.536 26.6961C51.536 26.6961 48.0371 21.0888 47.9177 14.8831"
                  stroke="#222"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <motion.path
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1, delay: 1.5 }}
                  d="M48.5147 25.1447C20.6975 30.8725 1.48528 20.8526 1.48528 1.51953"
                  stroke="#222"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="4 4"
                />
              </svg>
            </div>
          </motion.div>

          {/* Floating Card 2: Chart */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 1.2, type: "spring" }}
            className="absolute top-[65%] sm:top-[45%] -right-2 sm:right-4 lg:-right-8 bg-white rounded-2xl shadow-[0_12px_40px_rgb(0,0,0,0.08)] p-5 z-30 w-[180px] scale-75 origin-right sm:scale-100"
          >
            <p className="text-[11px] font-semibold text-gray-400 mb-4 tracking-wider uppercase">
              Higher Open Rates
            </p>
            <div className="flex items-end justify-between h-[80px] gap-2">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: "60%" }}
                transition={{ duration: 0.8, delay: 1.6 }}
                className="w-full bg-[#1A1A1A] rounded flex flex-col items-center justify-end"
              ></motion.div>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: "30%" }}
                transition={{ duration: 0.8, delay: 1.7 }}
                className="w-full bg-gray-200 rounded flex flex-col items-center justify-end"
              ></motion.div>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: "80%" }}
                transition={{ duration: 0.8, delay: 1.8 }}
                className="w-full bg-[#1A1A1A] rounded flex flex-col items-center justify-end"
              ></motion.div>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: "40%" }}
                transition={{ duration: 0.8, delay: 1.9 }}
                className="w-full bg-gray-200 rounded flex flex-col items-center justify-end"
              ></motion.div>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: "50%" }}
                transition={{ duration: 0.8, delay: 2.0 }}
                className="w-full bg-[#1A1A1A] rounded flex flex-col items-center justify-end"
              ></motion.div>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: "20%" }}
                transition={{ duration: 0.8, delay: 2.1 }}
                className="w-full bg-gray-200 rounded flex flex-col items-center justify-end"
              ></motion.div>
            </div>
            {/* Added subtle dots over the bars */}
            <div className="flex justify-between mt-2 px-1">
              <div className="w-1 h-1 bg-gray-300 rounded-full"></div>
              <div className="w-1 h-1 bg-gray-300 rounded-full"></div>
              <div className="w-1 h-1 bg-gray-300 rounded-full"></div>
              <div className="w-1 h-1 bg-gray-300 rounded-full"></div>
              <div className="w-1 h-1 bg-gray-300 rounded-full"></div>
              <div className="w-1 h-1 bg-gray-300 rounded-full"></div>
            </div>
          </motion.div>

          {/* Floating Card 3: Trust */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.4, type: "spring" }}
            className="absolute -bottom-6 sm:bottom-8 left-1 sm:left-auto sm:-right-4 lg:right-0 bg-white rounded-2xl shadow-[0_12px_40px_rgb(0,0,0,0.08)] p-4 pr-5 z-30 scale-[0.65] origin-bottom-left sm:origin-bottom-right sm:scale-100"
          >
            <p className="text-[13px] font-semibold text-gray-800 mb-3 whitespace-nowrap">
              5K+ Trust Our Emails
            </p>
            <div className="flex -space-x-2">
              <img
                src="https://i.pravatar.cc/100?img=51"
                alt="User"
                className="w-[34px] h-[34px] rounded-full border-2 border-white object-cover grayscale"
              />
              <img
                src="https://i.pravatar.cc/100?img=52"
                alt="User"
                className="w-[34px] h-[34px] rounded-full border-2 border-white object-cover grayscale"
              />
              <img
                src="https://i.pravatar.cc/100?img=53"
                alt="User"
                className="w-[34px] h-[34px] rounded-full border-2 border-white object-cover grayscale"
              />
              <img
                src="https://i.pravatar.cc/100?img=54"
                alt="User"
                className="w-[34px] h-[34px] rounded-full border-2 border-white object-cover grayscale"
              />
              <div className="w-[34px] h-[34px] rounded-full border-2 border-white bg-[#1A1A1A] flex items-center justify-center relative z-10">
                <Plus className="w-4 h-4 text-white" />
              </div>
            </div>
          </motion.div>
        </motion.div>
      </main>

      <div id="trusted-by">
        <TrustedBy />
      </div>

      <div id="features">
        <WhatsAppFeatures />
      </div>

      <div id="how-it-works">
        <HowItWorks />
      </div>



      <div id="contact">
        <ContactSection />
      </div>

      <Footer />
    </div>
  );
}
