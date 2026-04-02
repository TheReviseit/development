"use client";

import { motion } from "framer-motion";
import { Calendar, Bell, Shield, Smartphone, Zap, Users } from "lucide-react";

const features = [
  {
    title: "Instant Confirmation",
    description: "Bookings are confirmed immediately, eliminating the back-and-forth emails.",
    icon: Zap,
    color: "bg-yellow-100 text-yellow-600",
  },
  {
    title: "AI Smart Reminders",
    description: "Automated WhatsApp and email reminders to reduce no-shows by up to 80%.",
    icon: Bell,
    color: "bg-blue-100 text-blue-600",
  },
  {
    title: "Calendar Sync",
    description: "Seamlessly sync with Google, Outlook, and Apple calendars in real-time.",
    icon: Calendar,
    color: "bg-green-100 text-green-600",
  },
  {
    title: "Mobile First",
    description: "Manage your entire schedule from your phone with our intuitive dashboard.",
    icon: Smartphone,
    color: "bg-purple-100 text-purple-600",
  },
  {
    title: "Secure Payments",
    description: "Accept deposits or full payments at the time of booking with Stripe integration.",
    icon: Shield,
    color: "bg-red-100 text-red-600",
  },
  {
    title: "Team Management",
    description: "Easily manage multiple staff members, locations, and service categories.",
    icon: Users,
    color: "bg-indigo-100 text-indigo-600",
  },
];

export default function BookingFeatures() {
  return (
    <section id="features" className="py-24 bg-white relative overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16">
        <div className="text-center max-w-3xl mx-auto mb-20">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-[40px] md:text-[56px] font-serif font-black text-[#111111] leading-tight mb-6"
          >
            Everything you need to <br className="hidden md:block" />
            <span className="text-gray-400">scale your service</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg text-gray-600 font-medium"
          >
            Flowauxi provides the tools to automate your workflow, so you can spend more time doing what you love.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group p-10 rounded-[40px] border border-gray-100 bg-[#F9FAFB] hover:bg-white hover:shadow-[0_30px_60px_rgba(0,0,0,0.05)] transition-all duration-500"
            >
              <div className={`w-14 h-14 rounded-2xl ${feature.color} flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-500`}>
                <feature.icon className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-serif font-black text-[#111111] mb-4">
                {feature.title}
              </h3>
              <p className="text-gray-600 leading-relaxed font-medium">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
