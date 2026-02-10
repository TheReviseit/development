"use client";

import React from "react";
import { useParams } from "next/navigation";
import styles from "../store.module.css";
import {
  MapPin,
  Phone,
  Mail,
  Instagram,
  Facebook,
  Twitter,
} from "lucide-react";

interface StoreFooterProps {
  storeName: string;
  logoUrl?: string;
  address?: string;
  phone?: string;
  email?: string;
  socialMedia?: {
    instagram?: string;
    facebook?: string;
    twitter?: string;
    linkedin?: string;
    youtube?: string;
  };
}

export function StoreFooter({
  storeName,
  logoUrl,
  address,
  phone,
  email,
  socialMedia,
}: StoreFooterProps) {
  const currentYear = new Date().getFullYear();
  const params = useParams();
  const username = params.username as string;

  return (
    <footer className={styles.footer}>
      <div className={styles.footerContent}>
        <div className={styles.footerGrid}>
          {/* Brand Section */}
          <div className={styles.footerBrand}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={storeName}
                className={styles.footerLogo}
              />
            ) : (
              <h3 className={styles.footerStoreName}>{storeName}</h3>
            )}
            <p className={styles.footerDescription}>
              Premium quality products curated just for you. Experience the best
              shopping with {storeName}.
            </p>
            <div className={styles.socialLinks}>
              {socialMedia?.instagram && (
                <a
                  href={socialMedia.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.socialLink}
                  aria-label="Instagram"
                >
                  <Instagram size={20} />
                </a>
              )}
              {socialMedia?.facebook && (
                <a
                  href={socialMedia.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.socialLink}
                  aria-label="Facebook"
                >
                  <Facebook size={20} />
                </a>
              )}
              {socialMedia?.twitter && (
                <a
                  href={socialMedia.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.socialLink}
                  aria-label="Twitter"
                >
                  <Twitter size={20} />
                </a>
              )}
            </div>
          </div>

          {/* Quick Links */}
          <div className={styles.footerLinks}>
            <h4>Quick Links</h4>
            <ul>
              <li>
                <a href="#">Home</a>
              </li>
              <li>
                <a href="#products">Products</a>
              </li>
              <li>
                <a href="#about">About Us</a>
              </li>
              <li>
                <a href="#contact">Contact</a>
              </li>
            </ul>
          </div>

          {/* Customer Service */}
          <div className={styles.footerLinks}>
            <h4>Customer Service</h4>
            <ul>
              <li>
                <a href={`/store/${username}/track-order`}>Track Order</a>
              </li>
              <li>
                <a href="#">Shipping Policy</a>
              </li>
              <li>
                <a href="#">Returns & Exchanges</a>
              </li>
              <li>
                <a href="#">Terms of Service</a>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div className={styles.footerContact}>
            <h4>Contact Us</h4>
            <div className={styles.contactItem}>
              <MapPin size={18} />
              <span>{address || "123 Store Street, City, Country"}</span>
            </div>
            <div className={styles.contactItem}>
              <Phone size={18} />
              <span>{phone || "+91 98765 43210"}</span>
            </div>
            <div className={styles.contactItem}>
              <Mail size={18} />
              <span>{email || "support@store.com"}</span>
            </div>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <p>
            &copy; {currentYear} {storeName}. All rights reserved.
          </p>
          <div className={styles.poweredByContainer}>
            <span>Powered by</span>

            <a
              href="https://flowauxi.com/"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.flowauxiLink}
            >
              <span className={styles.flowauxiBrand}>Flowauxi</span>
              <img
                src="/logo.png"
                alt="Flowauxi"
                className={styles.flowauxiLogo}
              />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
