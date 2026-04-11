# Notempus Deployment Roadmap
**Status**: Phase 0 Local Testing | **Last Updated**: April 11, 2026

---

## Quick Plan

- **Phase 0** (Now): Test on laptop with friends → get feedback
- **Phase 1** (Later): Better approach when ready to go public

---

## 🧪 Phase 0: Local Testing with Friends

### How to Run

1. **Start dev servers on your laptop:**
```bash
bash dev.sh    # Starts web + all backend services
```

2. **Share with friends:**
   - **Same WiFi**: Give them `http://[your-laptop-ip]:3000`
   - **Outside your network**: Use ngrok
     ```bash
     npx ngrok http 3000
     # Share the ngrok URL with friends
     ```

3. **Collect feedback**
   - What do they like?
   - What's broken?
   - Would they use this?
   - Any confusing parts?

### What to Test
- ✅ Guest chat works
- ✅ No crashes
- ✅ UI/UX is good
- ✅ Would friends actually use this?

### Notes
- App only runs while your laptop is on
- Data resets if you restart
- This is BETA testing only
- Friends understand it's early stage

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
