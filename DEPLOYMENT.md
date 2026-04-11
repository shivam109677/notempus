# Notempus Deployment Roadmap
**Status**: Phase 0 Local Testing | **Last Updated**: April 11, 2026

---

## Quick Plan

- **Phase 0** (Now): Test on laptop with friends → get feedback
- **Phase 1** (Later): Better approach when ready to go public

---

## 🧪 Phase 0: Local Testing with Friends

### How to Run

**On your laptop (the server):**
```bash
bash dev.sh    # Starts web + all backend services
```

**Share with friends using ngrok:**
```bash
# In a new terminal, run:
npx ngrok http 3000

# Copy the generated URL and share with friends
# Example: https://abc123.ngrok.io
```

Friends can access from anywhere—different WiFi, different city, doesn't matter. Just share the ngrok URL.

### What to Test
- ✅ Guest chat works
- ✅ Video/audio works
- ✅ No crashes
- ✅ Is it fun to use?
- ✅ Would they actually use this?

### Collect Feedback
- What do they like?
- What's broken?
- What feels slow?
- Anything confusing?

### Important Notes
- App only runs while your laptop is on
- Data resets if you restart services
- This is BETA testing—friends understand it's early
- ngrok URL expires after 2 hours of inactivity (restart if needed)

---

## 🚀 Phase 1: Better Approach (Later)

When you're ready to go beyond laptop testing and want a real production approach, we'll:
- Deploy to a proper cloud platform
- Set up automatic backups
- Add monitoring and error tracking
- Make it available 24/7

We'll figure out the best approach when you get there.

---

## 📞 Questions?

Need help running Phase 0? Check:
- `bash dev.sh` working?
- Can friends access `http://[your-ip]:3000` on WiFi?
- Any errors? Check terminal output
