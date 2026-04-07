"use client";

import Link from "next/link";
import { Star, ArrowRight, Clock } from "lucide-react";
import { motion } from "framer-motion";

export default function BookingHero() {
  return (
    <div className="relative w-full">
      {/* Abstract Right Wavy Background */}
      <div className="absolute top-0 right-0 w-full lg:w-[58%] h-full pointer-events-none hidden lg:block overflow-hidden z-0">
        <svg
          viewBox="0 0 1000 1000"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="absolute right-0 top-0 w-[115%] h-[115%] object-cover origin-top-right"
          preserveAspectRatio="xMaxYMin slice"
        >
          {/* Decorative Back Wavy Blob for depth */}
          <path
            d="
            M 1000 180
            C 750 180, 500 -20, 380 180
            C 250 380, 480 430, 680 480
            C 880 530, 880 570, 680 600
            C 250 700, 150 900, 350 1000
            L 1000 1000
            Z
          "
            fill="#E8EBED"
            className="transform scale-[1.02] -translate-x-2 -translate-y-2"
          />

          {/* Main Masking Image Wave */}
          <defs>
            <clipPath id="wave-clip">
              <path
                d="
                M 1000 200
                C 750 200, 500 0, 400 200
                C 300 400, 500 450, 700 500
                C 850 537, 850 562, 700 600
                C 300 700, 200 900, 400 1000
                L 1000 1000
                Z
              "
              />
            </clipPath>
          </defs>
          <g clipPath="url(#wave-clip)">
            {/* The image goes inside the mask */}
            <image
              href="/booking/hero.jpg"
              x="0"
              y="0"
              width="1000"
              height="1000"
              preserveAspectRatio="xMidYMid slice"
              // opacity="0.95"
              // transform="scale(-1, 1) translate(-1000, 0)"
            />
          </g>
        </svg>
      </div>

      <main className="flex-1 w-full max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16 pt-12 lg:pt-24 pb-20 relative z-10 flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-8">
        {/* Left Column: Content */}
        <motion.div
          initial={{ x: -30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="w-full lg:w-[45%] max-w-2xl flex flex-col justify-center z-20"
        >
          {/* Reviews Badge */}
          <div className="flex items-center gap-4 mb-8">
            <div className="bg-white p-3 rounded-xl shadow-sm">
              <Star className="w-5 h-5 fill-[#111] text-[#111]" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-[15px]">5 Stars</p>
              <p className="text-sm font-semibold text-gray-600 underline decoration-gray-400 underline-offset-2 hover:text-gray-900 cursor-pointer">
                Read Our Success Stories
              </p>
            </div>
          </div>

          {/* Heading */}
          <h1 className="text-[64px] sm:text-[72px] lg:text-[88px] xl:text-[96px] font-serif font-black leading-[1.05] tracking-tight text-[#111111] mb-8">
            Provide
            <br />
            Lovely
            <br />
            Services
          </h1>

          {/* Subheading */}
          <p className="text-[19px] md:text-[22px] text-gray-800 font-medium leading-snug mb-10 max-w-[90%]">
            List your offerings. Get booked instantly
            <br />& grow your community.
          </p>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-6 mb-16">
            <Link
              href="/signup"
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-black text-white px-8 py-4 text-[16px] font-bold hover:bg-black/90 transition-all rounded-xl"
            >
              Get Started
            </Link>
            <Link
              href="#contact"
              className="w-full sm:w-auto flex items-center justify-center gap-2 text-[#1A1A1A] px-4 py-4 text-[16px] font-bold hover:opacity-80 transition-opacity underline decoration-2 underline-offset-4"
            >
              Contact Us <ArrowRight className="w-5 h-5 -rotate-45" />
            </Link>
          </div>

          {/* Bottom Left Info Sections */}
          <div className="flex flex-col sm:flex-row justify-between gap-16 lg:w-[130%] max-w-4xl mt-12 border-t border-gray-300 pt-10">
            <div className="flex-1">
              <h3 className="text-[40px] font-serif font-black leading-tight text-[#111111]">
                Get Updates
                <br />
                Live
              </h3>
            </div>
            <div className="flex-[1.2] flex flex-col sm:flex-row gap-8">
              <div className="flex-1 relative bg-white/60 backdrop-blur-xl p-8 rounded-[40px] border border-white/60 shadow-[0_20px_40px_rgba(0,0,0,0.1)] transition-transform hover:scale-[1.02]">
                <div className="absolute top-0 left-10 w-8 h-[2px] bg-gray-400 -mt-[42px] hidden sm:block"></div>
                <h4 className="text-[13px] font-bold text-gray-500 mb-3 uppercase tracking-wider">
                  Platform
                </h4>
                <h5 className="text-[32px] font-serif font-black leading-[1.1] text-[#111111] mb-3">
                  Showcase
                </h5>
                <p className="text-gray-600 text-[15px] leading-relaxed font-medium">
                  Best tools to go live and accept bookings instantly.
                </p>
              </div>
              <div className="flex-1 relative bg-white/60 backdrop-blur-xl p-8 rounded-[40px] border border-white/60 shadow-[0_20px_40px_rgba(0,0,0,0.1)] transition-transform hover:scale-[1.02]">
                <div className="absolute top-0 left-10 w-8 h-[2px] bg-gray-400 -mt-[42px] hidden sm:block"></div>
                <h4 className="text-[13px] font-bold text-gray-500 mb-3 uppercase tracking-wider">
                  Feedback
                </h4>
                <h5 className="text-[32px] font-serif font-black leading-[1.1] text-[#111111] mb-3">
                  Get Feedback
                </h5>
                <p className="text-gray-600 text-[15px] leading-relaxed font-medium">
                  Collect reviews right after a successful service completion.
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Right Column: Floating Ui Cards over Wavy Background */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="w-full lg:w-[50%] h-[500px] lg:h-auto relative z-30 mt-12 lg:mt-0 flex items-center justify-center lg:justify-end xl:pr-16"
        >
          {/* Wavy Background specifically for mobile since SVG background is hidden on small screens */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] -z-10 bg-transparent flex flex-wrap lg:hidden items-center justify-center gap-4">
            <div className="w-[100%] h-[100%] rounded-[100px] bg-[#E2E4E5]"></div>
          </div>

          <div className="relative w-full max-w-[500px] h-full min-h-[500px] lg:min-h-[600px] flex items-center justify-center pointer-events-none lg:pointer-events-auto">
            {/* Floating Card 1: Check In / Location */}
            <motion.div
              initial={{ opacity: 0, y: 40, x: 20 }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              transition={{
                duration: 0.8,
                delay: 0.8,
                type: "spring",
                bounce: 0.4,
              }}
              className="absolute top-[8%] right-0 lg:right-4 z-40 transform scale-[0.85] lg:scale-100"
            >
              {/* Back Glass Card */}
              <div className="bg-white/60 backdrop-blur-xl border border-white/60 rounded-[32px] shadow-[0_20px_40px_rgba(0,0,0,0.12)] p-4 pr-12 pb-10 flex items-center gap-3 w-max ml-auto relative">
                <div className="bg-black text-white px-3 py-1.5 rounded-[12px] text-[13px] font-bold">
                  Location
                </div>
                <div className="flex items-center gap-1.5 text-[15px] font-black text-gray-900">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                  Las Vegas
                </div>
              </div>

              {/* Front White Card with Premium Blur & Large Offset */}
              <div className="bg-white/70 backdrop-blur-xl rounded-[28px] p-5 px-6 shadow-[0_15px_35px_rgba(0,0,0,0.1)] flex items-center justify-between gap-8 absolute -bottom-16 -left-12 sm:-left-20 w-[280px] border border-white/60">
                <div className="font-black text-[22px] leading-[1.1] tracking-tight text-gray-900 text-left">
                  Park
                  <br />
                  Avenue
                </div>
                <div className="flex items-center gap-3">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="#111"
                    stroke="#111"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path>
                    <path
                      d="m9 12 2 2 4-4"
                      stroke="#fff"
                      strokeWidth="3"
                    ></path>
                  </svg>
                  <div className="flex items-center gap-1.5 bg-black text-white px-3 py-1.5 rounded-full text-[13px] font-bold">
                    <Star className="w-3.5 h-3.5 fill-white" /> 5.0
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Floating Card 2: Main Event/Service Info */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8, x: -30 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={{
                duration: 0.9,
                delay: 1,
                type: "spring",
                bounce: 0.3,
              }}
              className="absolute top-[58%] left-0 sm:left-[10%] lg:left-0 bg-white/60 backdrop-blur-xl border border-white/60 rounded-[40px] shadow-[0_30px_60px_rgba(0,0,0,0.15)] p-10 z-30 w-[340px] transform scale-[0.85] lg:scale-100"
            >
              <div className="flex justify-between items-center mb-6">
                <span className="font-bold text-[16px] text-gray-900">
                  Online
                </span>
                <span className="bg-[#111] text-white px-4 py-1.5 rounded-full text-[13px] font-bold tracking-wide">
                  VIP
                </span>
              </div>

              <h2 className="text-[36px] font-black tracking-tight text-gray-900 leading-tight mb-8">
                Consulting
                <br />
                Session
              </h2>

              {/* User Avatars */}
              <div className="flex items-center gap-4 mb-6">
                <div className="flex -space-x-4">
                  <img
                    src="https://i.pravatar.cc/100?img=33"
                    alt="User"
                    className="w-[44px] h-[44px] rounded-full border-[3px] border-white object-cover shadow-sm"
                  />
                  <img
                    src="https://i.pravatar.cc/100?img=47"
                    alt="User"
                    className="w-[44px] h-[44px] rounded-full border-[3px] border-white object-cover shadow-sm"
                  />
                  <div className="w-[44px] h-[44px] rounded-full border-[3px] border-white bg-black flex items-center justify-center z-10 font-bold text-[14px] text-white shadow-sm">
                    +9
                  </div>
                </div>
              </div>

              <p className="font-bold text-[16px] text-gray-900 mb-5">
                Invited Only - Private
              </p>

              <div className="flex items-center gap-6 text-[14px] font-bold text-gray-700">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5" /> 4:00 PM
                </div>
                <span className="text-gray-500">~ 1 Hr 45 Mins</span>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
