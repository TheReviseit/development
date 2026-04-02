"use client";

import Link from "next/link";
import Image from "next/image";
import { Github, Twitter, Linkedin, Mail, Heart } from "lucide-react";

const footerLinks = [
  {
    title: "Product",
    links: [
      { name: "Features", href: "#features" },
      { name: "How it Works", href: "#how-it-works" },
      { name: "Pricing", href: "/pricing" },
      { name: "Changelog", href: "#" },
    ],
  },
  {
    title: "Company",
    links: [
      { name: "About Us", href: "#" },
      { name: "Customers", href: "#" },
      { name: "Careers", href: "#" },
      { name: "Contact", href: "#" },
    ],
  },
  {
    title: "Resources",
    links: [
      { name: "Documentation", href: "#" },
      { name: "Help Center", href: "#" },
      { name: "Status Page", href: "#" },
      { name: "Privacy Policy", href: "/privacy" },
    ],
  },
];

export default function BookingFooter() {
  return (
    <footer className="bg-[#111111] text-white pt-24 pb-12 overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16 text-center lg:text-left">
        <div className="flex flex-col lg:flex-row justify-between gap-16 mb-20">
          <div className="max-w-sm mx-auto lg:mx-0">
            <Link
              href="/"
              className="flex items-center gap-2 mb-8 justify-center lg:justify-start"
            >
              <Image
                src="/logo.png"
                alt="Flowauxi Logo"
                width={40}
                height={40}
                className="object-contain"
              />
              <span className="text-2xl font-bold tracking-tight text-white">
                Flowauxi
              </span>
            </Link>
            <p className="text-gray-400 text-lg font-medium leading-relaxed mb-10">
              Flowauxi is an automated booking and service platform for modern
              professionals. Manage scheduling, payments, and customers in one
              place—so you can focus on what matters most.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-12 lg:gap-24">
            {footerLinks.map((section, index) => (
              <div key={index}>
                <h4 className="text-white font-serif font-black text-xl mb-8 uppercase tracking-widest text-xs opacity-50">
                  {section.title}
                </h4>
                <ul className="space-y-4">
                  {section.links.map((link, lIndex) => (
                    <li key={lIndex}>
                      <Link
                        href={link.href}
                        className="text-gray-400 font-bold hover:text-white transition-colors"
                      >
                        {link.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-12 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-8">
          <p className="text-gray-500 font-bold text-sm">
            © {new Date().getFullYear()} Flowauxi. All rights reserved.
          </p>
          <div className="flex items-center gap-2 text-gray-500 font-bold text-sm">
            Built with <Heart className="w-4 h-4 fill-red-500 text-red-500" />{" "}
            by the Flowauxi
          </div>
        </div>
      </div>
    </footer>
  );
}
