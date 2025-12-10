"use client";

import React, { useState, useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "./Testimonials.css";

// Register ScrollTrigger plugin
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

interface Testimonial {
  id: number;
  text: string;
  name: string;
  role: string;
  image: string;
}

const testimonialsData: Testimonial[] = [
  {
    id: 1,
    text: "ReviseIt has transformed how we communicate with our customers. The AI-powered responses are incredibly accurate and have reduced our response time by 80%. Our team can now focus on more complex customer needs.",
    name: "Sarah Johnson",
    role: "Head of Customer Success",
    image: "/testimonials/avatar-1.jpg",
  },
  {
    id: 2,
    text: "The WhatsApp automation features are game-changing. We've seen a 3x increase in customer engagement since implementing ReviseIt. The platform is intuitive and the support team is outstanding.",
    name: "Michael Chen",
    role: "CEO & Founder",
    image: "/testimonials/avatar-2.jpg",
  },
  {
    id: 3,
    text: "From setup to daily operations, ReviseIt has exceeded our expectations. The analytics dashboard provides invaluable insights that help us continuously improve our customer service strategy.",
    name: "Emily Rodriguez",
    role: "Operations Manager",
    image: "/testimonials/avatar-3.jpg",
  },
];

export default function Testimonials() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [typedText, setTypedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showAuthor, setShowAuthor] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const headerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);

  // Scroll animations for header
  useEffect(() => {
    if (titleRef.current && subtitleRef.current) {
      gsap.fromTo(
        titleRef.current,
        { opacity: 0, y: 30 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: {
            trigger: titleRef.current,
            start: "top 85%",
            toggleActions: "play none none none",
          },
        }
      );

      gsap.fromTo(
        subtitleRef.current,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          delay: 0.2,
          ease: "power3.out",
          scrollTrigger: {
            trigger: subtitleRef.current,
            start: "top 85%",
            toggleActions: "play none none none",
          },
        }
      );
    }
  }, []);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const goToNext = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setCurrentIndex((prev) => (prev + 1) % testimonialsData.length);
    setTimeout(() => setIsAnimating(false), 600);
  };

  const goToPrevious = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setCurrentIndex(
      (prev) => (prev - 1 + testimonialsData.length) % testimonialsData.length
    );
    setTimeout(() => setIsAnimating(false), 600);
  };

  // Show author first, then start typing (mobile only)
  useEffect(() => {
    const currentText = testimonialsData[currentIndex].text;

    // If not mobile, show full text immediately
    if (!isMobile) {
      setTypedText(currentText);
      setShowAuthor(true);
      setIsTyping(false);
      return;
    }

    // Mobile: typing animation
    let charIndex = 0;
    setTypedText("");
    setIsTyping(false);

    // Show author immediately
    setShowAuthor(true);

    // Wait for author animations to complete, then start typing
    const startTypingDelay = setTimeout(() => {
      setIsTyping(true);

      let typingTimer: NodeJS.Timeout;

      const typeNextChar = () => {
        if (charIndex < currentText.length) {
          setTypedText(currentText.slice(0, charIndex + 1));
          charIndex++;
          // Variable speed for more natural typing (50-70ms)
          const delay = 50 + Math.random() * 20;
          typingTimer = setTimeout(typeNextChar, delay);
        } else {
          setIsTyping(false);
        }
      };

      typeNextChar();

      return () => clearTimeout(typingTimer);
    }, 1200); // Wait 1.2s for author animations to complete

    return () => clearTimeout(startTypingDelay);
  }, [currentIndex, isMobile]);

  // Auto-play - pause for 5 seconds after typing completes
  useEffect(() => {
    if (!isTyping && typedText.length > 0) {
      const timer = setTimeout(() => {
        goToNext();
      }, 5000); // 5 second pause after typing completes

      return () => clearTimeout(timer);
    }
  }, [isTyping, typedText]);

  return (
    <section id="testimonials" className="testimonial-section">
      <div className="testimonial-bg-wrapper">
        <div className="testimonial-gradient-orb testimonial-gradient-orb-1"></div>
        <div className="testimonial-gradient-orb testimonial-gradient-orb-2"></div>
        <div className="testimonial-grid-pattern"></div>
      </div>

      <div className="testimonial-container">
        {/* Header */}
        <div className="testimonial-header" ref={headerRef}>
          {/* <span className="testimonial-badge">
            <span className="testimonial-badge-dot"></span>
            Testimonials
          </span> */}
          <h2 className="testimonial-main-title" ref={titleRef}>
            What Our{" "}
            <span className="testimonial-title-gradient">Core Clients</span> Say
          </h2>
          <p className="testimonial-main-subtitle" ref={subtitleRef}>
            Trusted by thousands of businesses worldwide to deliver exceptional
            customer experiences
          </p>
        </div>

        {/* Carousel */}
        <div className="testimonial-carousel">
          <div className="testimonial-carousel-track">
            {testimonialsData.map((testimonial, index) => {
              const isActive = index === currentIndex;
              const isPrev =
                index ===
                (currentIndex - 1 + testimonialsData.length) %
                  testimonialsData.length;
              const isNext =
                index === (currentIndex + 1) % testimonialsData.length;

              let className = "testimonial-card";
              if (isActive) className += " testimonial-card-active";
              else if (isPrev) className += " testimonial-card-prev";
              else if (isNext) className += " testimonial-card-next";

              return (
                <div key={testimonial.id} className={className}>
                  <div className="testimonial-card-inner">
                    <p className="testimonial-text">
                      <span className="testimonial-quote-icon testimonial-quote-open">
                        <svg
                          width="32"
                          height="32"
                          viewBox="0 0 48 48"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M12 32C15.866 32 19 28.866 19 25C19 21.134 15.866 18 12 18C8.13401 18 5 21.134 5 25C5 25.337 5.02 25.669 5.058 25.996C5.216 27.296 5.776 29.579 7.464 32.283C9.465 35.478 12.937 38.892 19 41V36.838C15.422 35.316 12.935 33.166 11.464 31.217C11.808 31.253 12.158 31.277 12.514 31.284C12.676 31.288 12.838 31.29 13 31.29V32H12ZM36 32C39.866 32 43 28.866 43 25C43 21.134 39.866 18 36 18C32.134 18 29 21.134 29 25C29 25.337 29.02 25.669 29.058 25.996C29.216 27.296 29.776 29.579 31.464 32.283C33.465 35.478 36.937 38.892 43 41V36.838C39.422 35.316 36.935 33.166 35.464 31.217C35.808 31.253 36.158 31.277 36.514 31.284C36.676 31.288 36.838 31.29 37 31.29V32H36Z"
                            fill="url(#quote-gradient-open)"
                          />
                          <defs>
                            <linearGradient
                              id="quote-gradient-open"
                              x1="5"
                              y1="18"
                              x2="43"
                              y2="41"
                              gradientUnits="userSpaceOnUse"
                            >
                              <stop stopColor="#ffffff" />
                              <stop offset="1" stopColor="#ffffff" />
                            </linearGradient>
                          </defs>
                        </svg>
                      </span>
                      {isActive ? typedText : testimonial.text}
                      {(isActive ? typedText.length > 0 : true) && (
                        <span className="testimonial-quote-icon testimonial-quote-close">
                          <svg
                            width="32"
                            height="32"
                            viewBox="0 0 48 48"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M36 16C32.134 16 29 19.134 29 23C29 26.866 32.134 30 36 30C39.866 30 43 26.866 43 23C43 22.663 42.98 22.331 42.942 22.004C42.784 20.704 42.224 18.421 40.536 15.717C38.535 12.522 35.063 9.108 29 7V11.162C32.578 12.684 35.065 14.834 36.536 16.783C36.192 16.747 35.842 16.723 35.486 16.716C35.324 16.712 35.162 16.71 35 16.71V16H36ZM12 16C8.134 16 5 19.134 5 23C5 26.866 8.134 30 12 30C15.866 30 19 26.866 19 23C19 22.663 18.98 22.331 18.942 22.004C18.784 20.704 18.224 18.421 16.536 15.717C14.535 12.522 11.063 9.108 5 7V11.162C8.578 12.684 11.065 14.834 12.536 16.783C12.192 16.747 11.842 16.723 11.486 16.716C11.324 16.712 11.162 16.71 11 16.71V16H12Z"
                              fill="url(#quote-gradient-close)"
                            />
                            <defs>
                              <linearGradient
                                id="quote-gradient-close"
                                x1="5"
                                y1="7"
                                x2="43"
                                y2="30"
                                gradientUnits="userSpaceOnUse"
                              >
                                <stop stopColor="#ffffff" />
                                <stop offset="1" stopColor="#ffffff" />
                              </linearGradient>
                            </defs>
                          </svg>
                        </span>
                      )}
                    </p>

                    <div
                      className={`testimonial-author ${
                        isActive && showAuthor ? "testimonial-author-show" : ""
                      }`}
                    >
                      <div className="testimonial-avatar">
                        <div className="testimonial-avatar-placeholder">
                          {testimonial.name.charAt(0)}
                        </div>
                      </div>
                      <div className="testimonial-author-info">
                        <h4 className="testimonial-author-name">
                          {testimonial.name}
                        </h4>
                        <span className="testimonial-author-role">
                          {testimonial.role}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Navigation */}
          <div className="testimonial-nav">
            <button
              className="testimonial-nav-btn testimonial-nav-prev"
              onClick={goToPrevious}
              aria-label="Previous testimonial"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              className="testimonial-nav-btn testimonial-nav-next"
              onClick={goToNext}
              aria-label="Next testimonial"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>

          {/* Dots Indicator */}
          <div className="testimonial-dots">
            {testimonialsData.map((_, index) => (
              <button
                key={index}
                className={`testimonial-dot ${
                  index === currentIndex ? "testimonial-dot-active" : ""
                }`}
                onClick={() => {
                  if (!isAnimating) {
                    setIsAnimating(true);
                    setCurrentIndex(index);
                    setTimeout(() => setIsAnimating(false), 600);
                  }
                }}
                aria-label={`Go to testimonial ${index + 1}`}
              ></button>
            ))}
          </div>
        </div>

        {/* Decorative Elements */}
        <div className="testimonial-decoration testimonial-decoration-1">
          <svg
            width="120"
            height="120"
            viewBox="0 0 120 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="60"
              cy="60"
              r="59"
              stroke="url(#decoration-gradient)"
              strokeWidth="2"
              opacity="0.2"
            />
            <defs>
              <linearGradient
                id="decoration-gradient"
                x1="0"
                y1="0"
                x2="120"
                y2="120"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#22C15A" />
                <stop offset="1" stopColor="#2DD4FF" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>
    </section>
  );
}
