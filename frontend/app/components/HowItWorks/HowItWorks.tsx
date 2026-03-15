"use client";

import { useEffect, useState } from "react";
import "./HowItWorks.css";
import Image from "next/image";
import { motion } from "framer-motion";

interface Step {
  id: string;
  title: string;
  description: string;
}

const steps: Step[] = [
  {
    id: "01",
    title: "Connect & Set Your Goals",
    description:
      "Tell Flowauxi Your Tasks, Files, Or Projects And Set Your Goals In Seconds.",
  },
  {
    id: "02",
    title: "AI Assists & Automates",
    description:
      "Flowauxi Analyzes Your Workflow, Automates Tasks, Answers Questions, And Delivers Smart Results Automatically.",
  },
  {
    id: "03",
    title: "Review, Control & Improve",
    description:
      "Stay In Control. Customize AI, Review Results, And Fine-Tune Performance From One Dashboard.",
  },
];

export default function HowItWorks() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <section className="get-started-section" id="how-it-works">
      <div className="get-started-container">
        {/* Left Side: Title & Illustration */}
        <div className="get-started-left">
          <motion.h2
            className="get-started-title"
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            Get Started In
            <br />
            Minutes.
          </motion.h2>

          <motion.div
            className="get-started-illustration"
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: 0.2 }}
          >
            <Image
              src="/marketing/robos.png"
              alt="AI Assistant Illustration"
              width={500}
              height={400}
              priority
            />
            <div
              style={{
                height: "1.5px",
                background: "#000000",
                width: "70%",
                marginTop: "-2px",
                opacity: 0.2,
              }}
            ></div>
          </motion.div>
        </div>

        {/* Right Side: Steps with Curved Path */}
        <div className="get-started-right">
          {/* Straight Vertical Path SVG */}
          <svg
            className="get-started-path-svg"
            viewBox="0 0 100 800"
            preserveAspectRatio="none"
          >
            <line
              x1="50"
              y1="0"
              x2="50"
              y2="800"
              className="get-started-path-line"
            />
          </svg>

          <div className="get-started-steps">
            {steps.map((step, index) => (
              <motion.div
                key={step.id}
                className="get-started-step"
                initial={{ opacity: 0, x: 50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.2 }}
              >
                <div className="step-number-container">
                  <span className="step-number">{step.id}</span>
                </div>
                <div className="step-content">
                  <h3 className="step-title">{step.title}</h3>
                  <p className="step-description">{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
