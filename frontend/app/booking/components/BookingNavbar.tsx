"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuthRedirect } from "@/app/hooks/useAuthRedirect";

export default function BookingNavbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const pathname = usePathname();
  const { handleLoginClick, handleGetStartedClick, isLoading } =
    useAuthRedirect();

  const isPricingPage = pathname === "/pricing";

  // Track scroll position for dynamic styling
  useEffect(() => {
    const handleScrollEvent = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScrollEvent);
    return () => window.removeEventListener("scroll", handleScrollEvent);
  }, []);

  const handleScroll = (
    e: React.MouseEvent<HTMLAnchorElement>,
    targetId: string,
  ) => {
    e.preventDefault();
    const element = document.getElementById(targetId);
    if (element) {
      // Adjust header offset slightly more if we have a shrinking sticky header
      const headerOffset = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition =
        elementPosition + window.pageYOffset - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
    setIsMobileMenuOpen(false);
  };

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className={`w-full sticky top-0 z-50 transition-all duration-300 ease-in-out ${
        isScrolled
          ? "py-4 bg-[#F1F3F4]/85 backdrop-blur-xl border-b border-gray-200/50 shadow-sm"
          : "pt-6 pb-4 bg-transparent"
      }`}
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
          {!isPricingPage && (
            <div className="hidden md:flex items-center gap-8 text-[15px] font-bold text-gray-800">
              <Link
                href="#features"
                onClick={(e) => handleScroll(e, "features")}
                className="hover:text-black transition-colors"
              >
                Features <span>.</span>
              </Link>
              <Link
                href="#how-it-works"
                onClick={(e) => handleScroll(e, "how-it-works")}
                className="hover:text-black transition-colors"
              >
                How it works <span>.</span>
              </Link>
              <Link
                href="/pricing"
                className="hover:text-black transition-colors"
              >
                Pricing <span>.</span>
              </Link>
              <Link
                href="#contact"
                onClick={(e) => handleScroll(e, "contact")}
                className="hover:text-black transition-colors"
              >
                Contact
              </Link>
            </div>
          )}

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-4">
            <a
              href="/login"
              onClick={handleLoginClick}
              className="px-8 py-3.5 border border-black rounded-full text-[15px] font-bold text-gray-800 hover:bg-gray-50 transition-all"
              style={{ opacity: isLoading ? 0.7 : 1 }}
            >
              {isLoading ? "..." : "Login"}
            </a>
            <a
              href="/signup"
              onClick={handleGetStartedClick}
              className="bg-black text-white px-8 py-3.5 border border-black rounded-full text-[16px] font-black hover:bg-white hover:text-black transition-all shadow-lg shadow-black/10"
              style={{ opacity: isLoading ? 0.7 : 1 }}
            >
              {isLoading ? "..." : "Get Started"}
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
            className="absolute top-full left-0 w-full bg-[#f1f3f4] shadow-xl z-50 md:hidden flex flex-col items-center py-6 gap-6 border-t border-gray-200"
          >
            {!isPricingPage && (
              <>
                <Link
                  href="#features"
                  className="text-[16px] font-bold text-gray-800"
                  onClick={(e) => handleScroll(e, "features")}
                >
                  Features
                </Link>
                <Link
                  href="#how-it-works"
                  className="text-[16px] font-bold text-gray-800"
                  onClick={(e) => handleScroll(e, "how-it-works")}
                >
                  How it works
                </Link>
                <Link
                  href="/pricing"
                  className="text-[16px] font-bold text-gray-800"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Pricing
                </Link>
                <Link
                  href="#contact"
                  className="text-[16px] font-bold text-gray-800"
                  onClick={(e) => handleScroll(e, "contact")}
                >
                  Contact
                </Link>
                <div className="w-full h-px bg-gray-200 my-2"></div>
              </>
            )}
            <div className="flex flex-col w-full px-6 gap-3">
              <a
                href="/login"
                onClick={handleLoginClick}
                className="w-full py-4 border border-black rounded-full text-[16px] font-bold text-center text-gray-800"
              >
                {isLoading ? "..." : "Login"}
              </a>
              <a
                href="/signup"
                onClick={handleGetStartedClick}
                className="w-full py-4 bg-black text-white border border-black rounded-full text-[16px] font-black text-center"
              >
                {isLoading ? "..." : "Get Started"}
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
