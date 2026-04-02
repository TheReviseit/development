"use client";

import { motion } from "framer-motion";
import { ListPlus, Share2, CalendarCheck } from "lucide-react";

const steps = [
  {
    number: "01",
    title: "List your services",
    description:
      "Create profiles for each service with custom pricing, durations, and availability.",
    icon: ListPlus,
    color: "bg-black text-white",
  },
  {
    number: "02",
    title: "Share your link",
    description:
      "Embed your booking page on your website or share it directly via WhatsApp, Instagram, or email.",
    icon: Share2,
    color: "bg-black text-white",
  },
  {
    number: "03",
    title: "Get booked instantly",
    description:
      "Receive instant notifications when customers book, and sync them to your calendar.",
    icon: CalendarCheck,
    color: "bg-white border-2 border-[#111111]",
  },
];

export default function BookingHowItWorks() {
  return (
    <section
      id="how-it-works"
      className="py-24 bg-[#F1F3F4] relative overflow-hidden"
    >
      <div className="max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16">
        <div className="flex flex-col lg:flex-row items-end justify-between mb-20 gap-8">
          <div className="max-w-2xl">
            <motion.h2
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-[40px] md:text-[56px] font-serif font-black text-[#111111] leading-tight mb-6"
            >
              How it works for <br className="hidden md:block" />
              <span className="text-gray-400">your business</span>
            </motion.h2>
          </div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="lg:mb-4"
          >
            <p className="text-lg text-gray-600 font-bold max-w-sm">
              We make it easy to start accepting <br /> bookings in under 5
              minutes.
            </p>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 lg:gap-8">
          {steps.map((step, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="relative flex flex-col group"
            >
              {/* Number Background */}
              <div className="absolute -top-10 -left-6 text-[120px] font-black font-serif text-white opacity-40 select-none group-hover:scale-110 transition-transform duration-500">
                {step.number}
              </div>

              <div className="relative z-10 bg-white/60 backdrop-blur-xl border border-white/60 rounded-[40px] p-10 flex-1 shadow-[0_30px_60px_rgba(0,0,0,0.05)] flex flex-col items-center text-center">
                <div
                  className={`w-16 h-16 rounded-2xl ${step.color} flex items-center justify-center mb-10 shadow-lg group-hover:rotate-6 transition-transform duration-500`}
                >
                  <step.icon className="w-8 h-8" />
                </div>
                <h3 className="text-[32px] font-serif font-black text-[#111111] leading-tight mb-4">
                  {step.title}
                </h3>
                <p className="text-gray-600 font-medium leading-relaxed">
                  {step.description}
                </p>
              </div>

              {/* Connector line for desktop */}
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-1/2 -right-4 w-8 h-[2px] bg-gray-300 z-0"></div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
