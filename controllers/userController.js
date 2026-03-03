const userService = require("../services/userService");
const customerProfileService = require("../services/customerProfileService");

const getUserMe = async (req, res) => {
  try {
    const user = await userService.getUserTokenData(req.user);

    return res.status(200).json({ user });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const listMyBookings = async (req, res) => {
  try {
    const result = await customerProfileService.listCustomerBookings({
      tokenPayload: req.user,
      page: req.query.page,
      limit: req.query.limit,
    });

    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const listMyTickets = async (req, res) => {
  try {
    const result = await customerProfileService.listCustomerTickets({
      tokenPayload: req.user,
      page: req.query.page,
      limit: req.query.limit,
    });

    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const downloadMyTicketPdf = async (req, res) => {
  try {
    const result = await customerProfileService.getCustomerTicketPdf({
      tokenPayload: req.user,
      ticketId: req.params.ticketId,
    });

    const filename = result?.filename || "ticket.pdf";
    const content = result?.buffer || Buffer.alloc(0);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Length", String(content.length));
    return res.status(200).send(content);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const listMySubscriptionSales = async (req, res) => {
  try {
    const result = await customerProfileService.listCustomerSubscriptionSales({
      tokenPayload: req.user,
      page: req.query.page,
      limit: req.query.limit,
    });

    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const getMySubscriptionSaleById = async (req, res) => {
  try {
    const result = await customerProfileService.getCustomerSubscriptionSaleById({
      tokenPayload: req.user,
      saleId: req.params.saleId,
    });

    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const listMyPayments = async (req, res) => {
  try {
    const result = await customerProfileService.listCustomerPayments({
      tokenPayload: req.user,
      page: req.query.page,
      limit: req.query.limit,
    });

    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

module.exports = {
  getUserMe,
  listMyBookings,
  listMyTickets,
  downloadMyTicketPdf,
  listMySubscriptionSales,
  getMySubscriptionSaleById,
  listMyPayments,
};
