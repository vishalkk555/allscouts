const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema");
const bcrypt=require('bcrypt');
const mongoose = require('mongoose');



const userProfile = async (req,res) => {
  try {

    const userId = req.session.user

    const user = await User.findById(userId)

    if(!user) return res.redirect('/login')

    res.render('userProfile',{user})
    
  } catch (error) {
    
    console.log("failed to load profile page")
     res.status(500).send("Error loading profile");

  }
}


const editProfile = async (req,res) => {
  try {
    const user = await User.findById(req.session.user)
    
    if(!user) return res.redirect('/login')
    
      res.render("editProfile",{user})
    
  } catch (error) {

     console.log("Error in loadin editprofile");
    res.status(500).send("Error loading edit profile");
    
  }
}

const updateProfile = async (req, res) => {
  try {
    const { name, email, phone, dob } = req.body;
    
    // Basic validations
    if (!name || !/^[a-zA-Z\s]+$/.test(name)) {
      return res.status(400).json({ error: 'Invalid name' });
    }
    if (phone && !/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ error: 'Invalid phone' });
    }
    if (dob) {
      const dobDate = new Date(dob);
      if (dobDate >= new Date()) {
        return res.status(400).json({ error: 'DOB must be in the past' });
      }
    }

    const user = await User.findById(req.session.user);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if email is being changed
    if (email && email !== user.email) {
      // Email is being changed - require OTP verification
      const otp = generateOtp();
      
      // Save OTP and pending data to session
      req.session.profileOtp = otp;
      req.session.profileOtpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes
      req.session.pendingProfileData = {
        name: name.trim(),
        email: email.trim(),
        phone: phone ? phone.trim() : null,
        dob: dob || null
      };
      if (req.file) {
        req.session.pendingProfileData.profileImage = req.file.path;
      }

      // Send OTP to the new email
      const emailSent = await sendProfileUpdateEmail(email, otp);
      
      if (!emailSent) {
        return res.status(500).json({ error: 'Failed to send OTP email' });
      }

      return res.json({ 
        success: true, 
        requiresOtp: true, 
        message: 'OTP sent to your new email address for verification' 
      });
    }

    // If email not changed, update directly
    user.name = name.trim();
    user.phone = phone ? phone.trim() : null;
    user.dob = dob || null;
    
    if (email) {
      user.email = email.trim(); // In case email was provided but same as current
    }
    
    if (req.file) {
      user.profileImage = [req.file.path];
    }
    
    await user.save();
    
    res.json({ 
      success: true, 
      message: 'Profile updated successfully',
      requiresOtp: false 
    });
    
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Server error' });
  }
};




const deleteProfileImage = async (req, res) => {
    try {
        const user = await User.findById(req.session.user); // make sure you're using req.session.user
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        
        if (user.profileImage && user.profileImage.length > 0) {
            const filePath = path.resolve(user.profileImage[0]); // resolve absolute path
            try {
                await fs.promises.unlink(filePath); // delete the file
                console.log("Profile image deleted:", filePath);
            } catch (err) {
                console.error("File delete error:", err);
            }
            user.profileImage = []; // clear image field
            await user.save();
            return res.json({ success: true, message: "Profile image deleted successfully" });
        } else {
            return res.json({ success: true, message: "No profile image to delete" });
        }

    } catch (error) {
        console.error('Error deleting profile image:', error);
        res.status(500).json({ error: 'Server error' });
    }
};


const changePassword = async (req,res) => {
try {
        if (!req.session.user) {
            return res.redirect('/login');
        }
        
        const user = await User.findById(req.session.user);
        if (!user) {
            return res.redirect('/login');
        }
        
        res.render('changePassword', { 
            user: user,
            title: 'Change Password - AllScouts'
        });
    } catch (error) {
        console.log('Error loading change password page:', error);
        res.redirect('/profile');
    }
}

const updatePassword = async (req,res,next) => {
  try {
    
   const {currentPassword, newPassword, confirmPassword} = req.body

   if(!req.session.user){
    return res.status(401).json({success:false,message:"Please Login in to continue"})
   }

   if(!currentPassword || !newPassword || !confirmPassword){
    return res.status(400).json({success:false, message:"All fields are required"})
   }

    const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
    if(!passwordRegex.test(newPassword)){
      return res.status(401).json({success:false, message:"New password must be at least 8 characters with 1 uppercase letter and 1 number"})
    }

    if(newPassword !== confirmPassword){
      return res.status(400).json({
        success:false,
        message:"NewPassword and ConfirmPassword Doesnt match"
      })
    }

    const user = await User.findById(req.session.user)

    if(!user){
      return res.status(400).json({success:false,message:"User not found"})
    }

    if(!user.password){
      return res.status(400).json({success:false,message:"Cannot change passwords for Social login accounts"})
    }
    
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword,user.password)
    if(!isCurrentPasswordValid){
      return res.status(400).json({success:false,message:"Current Password is incorrect"})
    }

    const isSamePassword = await bcrypt.compare(newPassword,user.password)
    if(isSamePassword){
      return res.status(400).json({success:false,message:"NewPassword must be different from the  Current Password"})
    }

    const saltRounds = 10
    const hashedNewPassword = await bcrypt.hash(newPassword,saltRounds)

    await User.findByIdAndUpdate(
      req.session.user,
      {password:hashedNewPassword},
      {new:true}
    )

    return res.json({success:true,message:"Succesfully Updated Password"})

  } catch (error) {
       next(error);
  }
}


const getAddresses = async (req, res) => {
  
    try {
        if (!req.session.user) {
            return res.redirect('/login');
        }
        
        const user = await User.findById(req.session.user);
        if (!user) {
            return res.redirect('/login');
        }
        
        const addressDoc = await Address.findOne({ userId: req.session.user});
        const addresses = addressDoc ? addressDoc.address : [];
        
        res.render('addresses', { 
            user: user,
            addresses: addresses,
            title: 'Addresses - AllScouts'
        });
    } catch (error) {
        console.log('Error loading addresses page:', error);
        res.redirect('/profile');
    }
};


const addAddress = async (req,res,next) => {
  try {

    if(!req.session.user){
      return res.redirect("/login")
    }
     
    const user = await User.findById(req.session.user)
    if(!user){
      return res.redirect("/login")
    }

    res.render("addAddress",{
      user,
      title:"Add Address - Allscouts"
    })
    
  } catch (error) {
    next(error)
  }
}


// Form validation for address
function validateAddress(data) {
  const {
    name, email, number, houseName, street,
    city, state, country, pincode, saveAs
  } = data;

  // Required fields
  if (!name || !email || !number || !houseName || !street || !city || !state || !country || !pincode || !saveAs) {
    return { success: false, message: "All required fields must be filled" };
  }

  // Name validation
  if (!/^[a-zA-Z\s]{2,50}$/.test(name.trim())) {
    return { success: false, message: "Name should contain only letters and spaces (2-50 characters)" };
  }

  // Email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, message: "Please enter a valid email address" };
  }

  // Phone number validation - handle both string and number
  const phoneStr = number.toString();
  if (!/^[6-9]\d{9}$/.test(phoneStr)) {
    return { success: false, message: "Phone number should be 10 digits starting with 6-9" };
  }

  // Pincode validation
  if (!/^\d{6}$/.test(pincode)) {
    return { success: false, message: "Pincode should be exactly 6 digits" };
  }

  // Text field validations
  const textFields = [
    { field: houseName, name: "House name" },
    { field: street, name: "Street address" },
    { field: city, name: "City" },
    { field: state, name: "State" }
  ];

  for (let textField of textFields) {
    if (!textField.field.trim() || textField.field.trim().length < 2 || textField.field.trim().length > 100) {
      return { success: false, message: `${textField.name} should be between 2-100 characters` };
    }
  }

  // SaveAs validation
  if (!["Home", "Work", "Other"].includes(saveAs)) {
    return { success: false, message: "Invalid address type selected" };
  }

  return { success: true };
}

const addNewAddress = async (req, res, next) => {
  try {
    console.log("Add Address Request Body:", req.body);
    console.log("Session User:", req.session.user);

    // Validate input data
    const validation = validateAddress(req.body);
    if (!validation.success) {
      return res.status(400).json(validation);
    }

    const {
      name, email, number, houseName, street,
      city, state, country, pincode, saveAs, isDefault
    } = req.body;

    // Check if user is logged in
    if (!req.session.user) {
      return res.status(401).json({ 
        success: false, 
        message: "Please login to continue" 
      });
    }

    // Find existing address document for user
    let userAddressDoc = await Address.findOne({ userId: req.session.user });

    if (!userAddressDoc) {
      // First address for this user → create new document
      userAddressDoc = new Address({
        userId: req.session.user,
        address: [{
          name: name.trim(),
          email: email.trim(),
          number: parseInt(number), // Store as number in DB
          houseName: houseName.trim(),
          street: street.trim(),
          city: city.trim(),
          state: state.trim(),
          country,
          pincode,
          saveAs,
          isDefault: !!isDefault
        }]
      });
    } else {
      // If isDefault = true, set all existing addresses to false
      if (isDefault) {
        userAddressDoc.address.forEach(addr => {
          addr.isDefault = false;
        });
      }

      // Add new address
      userAddressDoc.address.push({
        name: name.trim(),
        email: email.trim(),
        number: parseInt(number),
        houseName: houseName.trim(),
        street: street.trim(),
        city: city.trim(),
        state: state.trim(),
        country,
        pincode,
        saveAs,
        isDefault: !!isDefault
      });
    }

    // Save to database
    await userAddressDoc.save();
    
    console.log("Address added successfully for user:", req.session.user);
    
    return res.status(200).json({ 
      success: true, 
      message: "Address added successfully" 
    });

  } catch (error) {
    console.error("Add Address Error:", error);
    
    // Handle specific MongoDB errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: "Invalid data provided"
      });
    }
    
    // Handle other errors
    return res.status(500).json({
      success: false,
      message: "Internal server error. Please try again."
    });
  }
};


const getEditAddress = async (req, res,next) => {
    try {
        const userId = req.session.user ; 
        const { addressId } = req.params;

        if (!userId) {
            return res.redirect('/login');
        }

        // Validate addressId format
        if (!mongoose.Types.ObjectId.isValid(addressId)) {
            return res.status(400).render('error', {
                message: 'Invalid address ID',
                statusCode: 400
            });
        }

        // Find the user's address document
        const userAddress = await Address.findOne({ userId });

        if (!userAddress) {
            return res.status(404).render('error', {
                message: 'No addresses found',
                statusCode: 404
            });
        }

        // Find the specific address within the address array
        const address = userAddress.address.id(addressId);

        if (!address) {
            return res.status(404).render('error', {
                message: 'Address not found',
                statusCode: 404
            });
        }

        // Render edit address page with the address data
        res.render('editAddress', {
            title: 'Edit Address',
            address: address,
            user: req.session.user 
        });

    } catch (error) {
        console.error('Error fetching address for edit:', error);
       next(error)
    }
};

// PUT - Update address
const updateAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const {
            addressId,
            name,
            email,
            number,
            houseName,
            street,
            city,
            state,
            country,
            pincode,
            saveAs,
            isDefault
        } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Validate required fields
        if (!name || !email || !number || !houseName || !street || 
            !city || !state || !country || !pincode || !saveAs) {
            return res.status(400).json({
                success: false,
                message: 'All required fields must be filled'
            });
        }

        // Validate addressId format
        if (!mongoose.Types.ObjectId.isValid(addressId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid address ID'
            });
        }

        // Validate field formats
        const nameRegex = /^[a-zA-Z\s]{2,50}$/;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const phoneRegex = /^[6-9]\d{9}$/;
        const pincodeRegex = /^\d{6}$/;

        if (!nameRegex.test(name.trim())) {
            return res.status(400).json({
                success: false,
                message: 'Name should contain only letters and spaces (2-50 characters)'
            });
        }

        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid email address'
            });
        }

        if (!phoneRegex.test(number.toString())) {
            return res.status(400).json({
                success: false,
                message: 'Phone number should be 10 digits starting with 6-9'
            });
        }

        if (!pincodeRegex.test(pincode)) {
            return res.status(400).json({
                success: false,
                message: 'Pincode should be exactly 6 digits'
            });
        }

        if (!['Home', 'Work', 'Other'].includes(saveAs)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid address type'
            });
        }

        // Validate text fields length
        const textFields = [houseName, street, city, state];
        for (let field of textFields) {
            if (field.trim().length < 2 || field.trim().length > 100) {
                return res.status(400).json({
                    success: false,
                    message: 'Address fields should be between 2-100 characters'
                });
            }
        }

        // Find the user's address document
        const userAddress = await Address.findOne({ userId });

        if (!userAddress) {
            return res.status(404).json({
                success: false,
                message: 'Address document not found'
            });
        }

        // Find the specific address within the address array
        const addressToUpdate = userAddress.address.id(addressId);

        if (!addressToUpdate) {
            return res.status(404).json({
                success: false,
                message: 'Address not found'
            });
        }

        // If setting as default, first unset all other default addresses
        if (isDefault) {
            userAddress.address.forEach(addr => {
                addr.isDefault = false;
            });
        }

        // Update the address fields
        addressToUpdate.name = name.trim();
        addressToUpdate.email = email.trim();
        addressToUpdate.number = parseInt(number);
        addressToUpdate.houseName = houseName.trim();
        addressToUpdate.street = street.trim();
        addressToUpdate.city = city.trim();
        addressToUpdate.state = state.trim();
        addressToUpdate.country = country;
        addressToUpdate.pincode = pincode;
        addressToUpdate.saveAs = saveAs;
        addressToUpdate.isDefault = isDefault || false;

        // Save the updated document
        await userAddress.save();

        res.status(200).json({
            success: true,
            message: 'Address updated successfully',
            data: {
                addressId: addressToUpdate._id,
                updatedAddress: addressToUpdate
            }
        });

    } catch (error) {
        console.error('Error updating address:', error);
        
        // Handle MongoDB validation errors
        if (error.name === 'ValidationError') {
            const validationErrors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: validationErrors.join(', ')
            });
        }

        // Handle duplicate key errors (if any unique constraints)
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Duplicate address information found'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to update address. Please try again later.'
        });
    }
};

const setDefaultAddress = async (req, res,next) => {
    try {
        const userId = req.session.user;
        const { addressId } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        if (!addressId) {
            return res.status(400).json({
                success: false,
                message: 'Address ID is required'
            });
        }

        if (!mongoose.Types.ObjectId.isValid(addressId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid address ID format'
            });
        }

        const userAddress = await Address.findOne({ userId });

        if (!userAddress) {
            return res.status(404).json({
                success: false,
                message: 'No addresses found for this user'
            });
        }

        // Find the specific address within the address array
        const targetAddress = userAddress.address.id(addressId);

        if (!targetAddress) {
            return res.status(404).json({
                success: false,
                message: 'Address not found'
            });
        }

        if (targetAddress.isDefault) {
            return res.status(400).json({
                success: false,
                message: 'This address is already set as default'
            });
        }

        userAddress.address.forEach(addr => {
            addr.isDefault = false;
        });

        targetAddress.isDefault = true;

        await userAddress.save();

        res.status(200).json({
            success: true,
            message: 'Default address updated successfully',
            data: {
                addressId: targetAddress._id,
                addressType: targetAddress.saveAs
            }
        });

    } catch (error) {
        console.error('Error setting default address:', error);
        next(error)
       
    }
};


// DELETE - Delete address
const deleteAddress = async (req, res,next) => {
    try {
        const userId = req.session.user;
        const { addressId } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        if (!addressId) {
            return res.status(400).json({
                success: false,
                message: 'Address ID is required'
            });
        }

        // Validate addressId format
        if (!mongoose.Types.ObjectId.isValid(addressId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid address ID format'
            });
        }

        const userAddress = await Address.findOne({ userId });

        if (!userAddress) {
            return res.status(404).json({
                success: false,
                message: 'No addresses found for this user'
            });
        }

        // Find the specific address within the address array
        const addressToDelete = userAddress.address.id(addressId);

        if (!addressToDelete) {
            return res.status(404).json({
                success: false,
                message: 'Address not found'
            });
        }

        // Check if trying to delete a default address
        if (addressToDelete.isDefault) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete default address. Please set another address as default first.'
            });
        }

        // Store address info for response (before deletion)
        const deletedAddressInfo = {
            name: addressToDelete.name,
            saveAs: addressToDelete.saveAs,
            city: addressToDelete.city
        };

        userAddress.address.pull(addressId);

        await userAddress.save();

        res.status(200).json({
            success: true,
            message: 'Address deleted successfully',
            data: {
                deletedAddress: deletedAddressInfo,
                remainingAddressCount: userAddress.address.length
            }
        });

    } catch (error) {
        console.error('Error deleting address:', error);
        next(error)
};
}


  const getAddressForModal = async (req, res) => {
    try {
        const userId = req.session.user;
        const { addressId } = req.params;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Login required'
            });
        }

        if (!mongoose.Types.ObjectId.isValid(addressId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid address ID'
            });
        }

        const userAddress = await Address.findOne({ userId });
        if (!userAddress) {
            return res.status(404).json({
                success: false,
                message: 'No addresses found'
            });
        }

        const address = userAddress.address.id(addressId);
        if (!address) {
            return res.status(404).json({
                success: false,
                message: 'Address not found'
            });
        }

        // Return JSON for modal
        res.json({
            success: true,
            address
        });

    } catch (error) {
        console.error('Error fetching address:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch address'
        });
    }
};



module.exports = {
      userProfile,
    editProfile,
    updateProfile,
    deleteProfileImage,
    changePassword,
    updatePassword,
    getAddresses,
    addAddress,
    addNewAddress,
    getEditAddress,
    updateAddress,
    setDefaultAddress,
    deleteAddress,
    getAddressForModal
    
}