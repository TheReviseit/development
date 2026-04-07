"use client";

import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export default function BookingCTA() {
  return (
    <section className="py-24 bg-white relative overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, type: "spring", bounce: 0.4 }}
          className="relative bg-[#FFE240] rounded-[60px] p-12 md:p-24 overflow-hidden flex flex-col items-center text-center border-4 border-[#111111] shadow-[20px_20px_0_rgba(0,0,0,0.1)]"
        >
          {/* Decorative Sparkles */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="absolute top-10 left-10 text-black/20"
          >
            <Sparkles className="w-20 h-20" />
          </motion.div>
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
            className="absolute bottom-10 right-10 text-black/20"
          >
            <Sparkles className="w-16 h-16" />
          </motion.div>

          <h2 className="text-[48px] md:text-[72px] font-serif font-black text-[#111111] leading-[1.1] mb-8 tracking-tight max-w-4xl relative z-10">
            Ready to give your <br />
            <span className="text-black/60">customers the best</span> <br />
            booking experience?
          </h2>

          <p className="text-lg md:text-xl text-[#111111] font-bold mb-12 max-w-2xl relative z-10">
            Join 500+ service providers who dropped the manual scheduling and 2x
            their bookings in the first month.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-6 relative z-10">
            <Link
              href="/signup"
              className="bg-black text-white px-10 py-6 rounded-[24px] text-lg font-black hover:scale-105 transition-transform flex items-center justify-center gap-3 shadow-xl"
            >
              Get Started Now
              <ArrowRight className="w-6 h-6" />
            </Link>
            <Link
              href="/signup"
              className="bg-white/40 backdrop-blur-md text-[#111111] border-2 border-black px-10 py-6 rounded-[24px] text-lg font-black hover:bg-white/60 transition-all shadow-lg"
            >
              Get Started Now
            </Link>
          </div>

          <div className="mt-12 flex items-center gap-4 text-sm font-black text-black/70">
            <div className="flex -space-x-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full border-2 border-[#FFE240] bg-gray-200 overflow-hidden"
                >
                  <Image
                    src={`https://i.pravatar.cc/100?img=${i + 10}`}
                    alt="User avatar"
                    width={32}
                    height={32}
                  />
                </div>
              ))}
            </div>
            Trusted by providers worldwide.
          </div>
        </motion.div>
      </div>
    </section>
  );
}
